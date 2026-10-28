import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { readdirSync } from "node:fs"
import { type IncomingMessage, Server, type ServerResponse } from "node:http"
import path from "node:path"
import { errorBody } from "@/lib/api/errors"
import { type Config, getConfig } from "@/lib/config"

type Lane = "normal" | "probe" | "maintenance"
type Limits = Config["admission"]
type Budget = { limit: number; active: number; peak: number; admitted: number; rejected: number }
type RequestContext = {
  lane: Lane
  aborted: boolean
  overloaded: boolean
  response?: ServerResponse
  cancelQueued: Set<() => void>
}

export class AdmissionError extends Error {
  readonly status = 503
  readonly retryAfterSeconds = 1
  constructor() {
    super("The server is busy. Try again shortly.")
    this.name = "AdmissionError"
  }
}
export function isAdmissionError(error: unknown): error is AdmissionError {
  return error instanceof AdmissionError
}
const unavailableBody = JSON.stringify(errorBody(503, "The server is busy. Try again shortly."))
export const admissionHeaders = {
  "retry-after": "1",
  "cache-control": "private, no-store",
}
function budget(limit: number): Budget {
  return { limit, active: 0, peak: 0, admitted: 0, rejected: 0 }
}
function acquire(value: Budget) {
  if (value.active >= value.limit) {
    value.rejected++
    return null
  }
  return enter(value)
}
function enter(value: Budget) {
  value.active++
  value.admitted++
  value.peak = Math.max(value.peak, value.active)
  let released = false
  return () => {
    if (released) return
    released = true
    value.active--
  }
}
function unavailable(response: ServerResponse) {
  response.statusCode = 503
  for (const [name, value] of Object.entries(admissionHeaders)) response.setHeader(name, value)
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.setHeader("content-length", Buffer.byteLength(unavailableBody))
  response.end(unavailableBody)
}

export function createRequestAdmission(
  limits: Limits,
  staticAssets: ReadonlySet<string> = new Set(),
) {
  const contexts = new AsyncLocalStorage<RequestContext>()
  const bestEffort = new AsyncLocalStorage<boolean>()
  const http = {
    normal: budget(limits.http),
    probe: budget(limits.probes),
    live: budget(limits.streams),
  }
  const database = {
    normal: budget(
      Math.max(1, limits.database - limits.databaseProbes - limits.databaseMaintenance),
    ),
    probe: budget(Math.min(limits.databaseProbes, limits.database)),
    maintenance: budget(Math.min(limits.databaseMaintenance, limits.database)),
    total: budget(limits.database),
  }
  const pressure = new Map<string, () => boolean>()
  type Waiter = { lane: Lane; start: (release: () => void) => void; cancel: () => void }
  const waiting: Waiter[] = []
  const queue = { limit: limits.databaseQueue, active: 0, peak: 0, rejected: 0, aborted: 0 }
  let aborted = 0
  let pressureRejected = 0
  let abortedDatabase = 0
  let lateDatabaseRejected = 0
  function pressured() {
    for (const check of pressure.values()) {
      try {
        if (check()) return true
      } catch {
        return true
      }
    }
    return false
  }
  function refuse(): never {
    const context = contexts.getStore()
    if (context && !context.overloaded && !bestEffort.getStore()) {
      context.overloaded = !context.response?.headersSent
      if (!context.overloaded) lateDatabaseRejected++
    }
    throw new AdmissionError()
  }
  function assertRequestActive() {
    if (contexts.getStore()?.aborted) {
      abortedDatabase++
      refuse()
    }
  }
  function acquireDatabase(lane: Lane) {
    if (
      database[lane].active >= database[lane].limit ||
      database.total.active >= database.total.limit
    )
      return null
    const releaseLane = enter(database[lane])
    const releaseTotal = enter(database.total)
    return () => {
      releaseTotal()
      releaseLane()
      drainQueue()
    }
  }
  function drainQueue() {
    for (let index = 0; index < waiting.length; ) {
      const waiter = waiting[index]
      if (!waiter) break
      const release = acquireDatabase(waiter.lane)
      if (!release) {
        index++
        continue
      }
      waiting.splice(index, 1)
      queue.active--
      waiter.start(release)
    }
  }
  async function runDatabaseWork<T>(work: () => T | PromiseLike<T>): Promise<T> {
    assertRequestActive()
    const context = contexts.getStore()
    const lane = context?.lane ?? "normal"
    let release = acquireDatabase(lane)
    if (!release) {
      if (waiting.length >= queue.limit) {
        database[lane].rejected++
        database.total.rejected++
        queue.rejected++
        return refuse()
      }
      release = await new Promise<() => void>((resolve, reject) => {
        const waiter: Waiter = {
          lane,
          start(release) {
            context?.cancelQueued.delete(waiter.cancel)
            resolve(release)
          },
          cancel() {
            const index = waiting.indexOf(waiter)
            if (index < 0) return
            waiting.splice(index, 1)
            queue.active--
            queue.aborted++
            abortedDatabase++
            context?.cancelQueued.delete(waiter.cancel)
            reject(new AdmissionError())
          },
        }
        context?.cancelQueued.add(waiter.cancel)
        waiting.push(waiter)
        queue.active++
        queue.peak = Math.max(queue.peak, queue.active)
      })
    }
    try {
      assertRequestActive()
      return await work()
    } finally {
      release()
    }
  }
  function handle(request: IncomingMessage, response: ServerResponse, dispatch: () => boolean) {
    const pathname = (request.url ?? "/").split("?")[0] ?? "/"
    const read = request.method === "GET" || request.method === "HEAD"
    if (read && staticAssets.has(pathname)) return dispatch()
    const httpLane =
      read && ["/api/health", "/api/metrics"].includes(pathname)
        ? "probe"
        : read && pathname === "/api/live"
          ? "live"
          : "normal"
    const lane = httpLane === "probe" ? "probe" : "normal"
    const blocked = httpLane !== "probe" && pressured()
    const release = blocked ? null : acquire(http[httpLane])
    if (!release) {
      if (blocked) {
        pressureRejected++
        http[httpLane].rejected++
      }
      response.setHeader("connection", "close")
      unavailable(response)
      request.resume()
      return true
    }
    const context: RequestContext = {
      lane,
      aborted: false,
      overloaded: false,
      response,
      cancelQueued: new Set(),
    }
    const abort = () => {
      if (context.aborted) return
      context.aborted = true
      aborted++
      for (const cancel of context.cancelQueued) cancel()
    }
    let completed = false
    const complete = () => {
      if (completed) return
      completed = true
      if (!response.writableFinished) abort()
      release()
    }
    request.once("aborted", abort)
    response.once("finish", complete)
    response.once("close", complete)

    // Next may wrap a rendering error, or a handler may catch it. Keep the refusal at the
    // transport boundary so either path still emits a temporary 503 before headers are sent.
    const writeHead = response.writeHead
    const write = response.write
    const end = response.end
    const prepareRefusal = () => {
      for (const name of response.getHeaderNames()) response.removeHeader(name)
      response.statusCode = 503
      for (const [name, value] of Object.entries(admissionHeaders)) response.setHeader(name, value)
      response.setHeader("content-type", "application/json; charset=utf-8")
      response.setHeader("content-length", Buffer.byteLength(unavailableBody))
    }
    response.writeHead = function (
      this: ServerResponse,
      ...args: Parameters<ServerResponse["writeHead"]>
    ) {
      if (context.overloaded && !this.headersSent) {
        prepareRefusal()
        return writeHead.call(this, 503)
      }
      return Reflect.apply(writeHead, this, args)
    } as ServerResponse["writeHead"]
    response.write = function (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>) {
      if (!context.overloaded) return Reflect.apply(write, this, args)
      const callback = args.find((arg) => typeof arg === "function")
      if (typeof callback === "function") queueMicrotask(() => callback())
      return true
    } as ServerResponse["write"]
    response.end = function (this: ServerResponse, ...args: Parameters<ServerResponse["end"]>) {
      if (!context.overloaded) return Reflect.apply(end, this, args)
      if (!this.headersSent) prepareRefusal()
      const callback = args.find((arg) => typeof arg === "function")
      return end.call(this, unavailableBody, typeof callback === "function" ? callback : undefined)
    } as ServerResponse["end"]
    return contexts.run(context, dispatch)
  }
  return {
    handle,
    hasContext: () => contexts.getStore() !== undefined,
    runDatabaseWork,
    assertRequestActive,
    runBestEffortWork<T>(work: () => T | PromiseLike<T>) {
      return bestEffort.run(true, work)
    },
    runMaintenanceWork<T>(work: () => T | PromiseLike<T>) {
      return contexts.run(
        { lane: "maintenance", aborted: false, overloaded: false, cancelQueued: new Set() },
        work,
      )
    },
    registerPressure(name: string, check: () => boolean) {
      pressure.set(name, check)
      return () => {
        if (pressure.get(name) === check) pressure.delete(name)
      }
    },
    snapshot() {
      return {
        http: { normal: { ...http.normal }, probe: { ...http.probe }, live: { ...http.live } },
        database: Object.fromEntries(
          Object.entries(database).map(([name, value]) => [name, { ...value }]),
        ),
        databaseQueue: { ...queue },
        aborted,
        abortedDatabase,
        lateDatabaseRejected,
        pressureRejected,
      }
    },
  }
}
function immutableStaticAssets() {
  const folder = path.join(process.cwd(), ".next/static")
  try {
    return new Set(
      readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map(
          (entry) =>
            `/_next/static/${path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")}`,
        ),
    )
  } catch {
    return new Set<string>()
  }
}
const state = globalThis as typeof globalThis & {
  __sniptideAdmission?: ReturnType<typeof createRequestAdmission>
  __sniptideAdmissionInstalled?: boolean
}
function admission() {
  state.__sniptideAdmission ??= createRequestAdmission(
    getConfig().admission,
    immutableStaticAssets(),
  )
  return state.__sniptideAdmission
}
export function installRequestAdmission() {
  if (state.__sniptideAdmissionInstalled) return
  const controller = admission()
  const emit = Server.prototype.emit
  Server.prototype.emit = function (event: string | symbol, ...args: unknown[]) {
    if (event !== "request") return Reflect.apply(emit, this, [event, ...args])
    return controller.handle(args[0] as IncomingMessage, args[1] as ServerResponse, () =>
      Reflect.apply(emit, this, [event, ...args]),
    )
  }
  state.__sniptideAdmissionInstalled = true
}
export function admissionSnapshot() {
  return admission().snapshot()
}
export function registerAdmissionPressure(name: string, check: () => boolean) {
  return admission().registerPressure(name, check)
}
export function runBestEffortWork<T>(work: () => T | PromiseLike<T>) {
  return admission().runBestEffortWork(work)
}
export function runMaintenanceWork<T>(work: () => T | PromiseLike<T>) {
  return admission().runMaintenanceWork(work)
}
export async function withDatabaseAdmission<T>(work: () => T | PromiseLike<T>) {
  if (!state.__sniptideAdmissionInstalled && !state.__sniptideAdmission?.hasContext())
    return await work()
  return admission().runDatabaseWork(work)
}
export function assertRequestActive() {
  state.__sniptideAdmission?.assertRequestActive()
}
