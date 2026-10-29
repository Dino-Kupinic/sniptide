import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { type IncomingMessage, Server, type ServerResponse } from "node:http"
import { monitorEventLoopDelay, performance } from "node:perf_hooks"
import { envInteger } from "@workspace/db/config"
import { admissionSnapshot, assertRequestActive, withDatabaseAdmission } from "./request-admission"

interface RequestStats {
  queries: number
  queryMs: number
}
interface Metric {
  count: number
  errors: number
  sumMs: number
  maxMs: number
  buckets: number[]
}
const state = globalThis as typeof globalThis & {
  __sniptideTelemetry?: ReturnType<typeof createState>
}
function createState() {
  return {
    requests: new AsyncLocalStorage<RequestStats>(),
    metrics: new Map<string, Metric>(),
    started: false,
    loop: monitorEventLoopDelay({ resolution: 20 }),
    maintenance: {} as Record<string, number | boolean>,
  }
}
state.__sniptideTelemetry ??= createState()
const telemetry = state.__sniptideTelemetry
const boundaries = [10, 50, 100, 250, 500, 1000, 3000, 10000]
export function recordMetric(name: string, ms: number, failed = false) {
  let value = telemetry.metrics.get(name)
  if (!value) {
    if (telemetry.metrics.size >= 128) return
    value = {
      count: 0,
      errors: 0,
      sumMs: 0,
      maxMs: 0,
      buckets: Array<number>(boundaries.length + 1).fill(0),
    }
    telemetry.metrics.set(name, value)
  }
  value.count++
  value.errors += Number(failed)
  value.sumMs += ms
  value.maxMs = Math.max(value.maxMs, ms)
  const bucket = boundaries.findIndex((limit) => ms <= limit)
  value.buckets[bucket < 0 ? boundaries.length : bucket] =
    (value.buckets[bucket < 0 ? boundaries.length : bucket] ?? 0) + 1
}
export async function observe<T>(
  name: string,
  work: () => PromiseLike<T> | T,
  query = false,
): Promise<T> {
  const started = performance.now()
  let failed = false
  try {
    return await work()
  } catch (error) {
    failed = true
    throw error
  } finally {
    const durationMs = performance.now() - started
    recordMetric(name, durationMs, failed)
    if (query) {
      const request = telemetry.requests.getStore()
      if (request) {
        request.queries++
        request.queryMs += durationMs
      }
      if (durationMs > envInteger("SLOW_QUERY_MS", 500, 1, 60000))
        console.warn(JSON.stringify({ event: "slow_query", operation: name, durationMs, failed }))
    }
  }
}
export function recordMaintenance(values: Record<string, number | boolean>) {
  // Merged, because the purge and the analytics rollup each report their own keys.
  telemetry.maintenance = { ...telemetry.maintenance, ...values }
}
function route(path = "/") {
  const pathname = path.split("?")[0] ?? "/"
  if (/^\/secret-share(?:\/|$)/.test(pathname))
    return pathname.endsWith("/reveal") ? "/secret-share/[token]/reveal" : "/secret-share/[token]"
  if (/^\/secrets(?:\/|$)/.test(pathname))
    return pathname === "/secrets" ? "/secrets" : "/secrets/[id]"
  if (/^\/pastes\/[^/]+/.test(pathname))
    return pathname.endsWith("/edit") ? "/pastes/[slug]/edit" : "/pastes/[slug]"
  if (/^\/collections\/[^/]+/.test(pathname)) return "/collections/[slug]"
  if (pathname.startsWith("/api/auth/")) return "/api/auth/[...all]"
  if (pathname.startsWith("/_next/")) return "/_next/*"
  if (
    [
      "/",
      "/dashboard",
      "/pastes",
      "/starred",
      "/shared",
      "/trash",
      "/collections",
      "/new",
      "/settings",
      "/sign-in",
      "/sign-up",
      "/api/health",
      "/api/metrics",
    ].includes(pathname)
  )
    return pathname
  if (pathname.endsWith("/raw")) return "/[slug]/raw"
  if (pathname.endsWith("/unlock")) return "/[slug]/unlock"
  if (pathname.endsWith("/reveal")) return "/[slug]/reveal"
  return "/[slug]"
}
export function startTelemetry() {
  if (telemetry.started) return
  telemetry.started = true
  telemetry.loop.enable()
  const original = Server.prototype.emit
  Server.prototype.emit = function (event: string | symbol, ...args: unknown[]) {
    if (event !== "request") return Reflect.apply(original, this, [event, ...args])
    const request = args[0] as IncomingMessage
    const response = args[1] as ServerResponse
    const stats: RequestStats = { queries: 0, queryMs: 0 }
    const started = performance.now()
    let completed = false
    const finish = () => {
      if (completed) return
      completed = true
      const name = route(request.url)
      const durationMs = performance.now() - started
      recordMetric(
        `http:${name}`,
        durationMs,
        response.statusCode >= 500 || !response.writableFinished,
      )
      console.info(
        JSON.stringify({
          event: "request",
          route: name,
          method: request.method,
          status: response.statusCode,
          durationMs,
          queries: stats.queries,
          queryMs: stats.queryMs,
          aborted: !response.writableFinished,
          contentLength: response.getHeader("content-length") ?? null,
        }),
      )
    }
    response.once("finish", finish)
    response.once("close", finish)
    return telemetry.requests.run(stats, () => Reflect.apply(original, this, [event, ...args]))
  }
}
export function telemetrySnapshot() {
  return {
    uptimeSeconds: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    eventLoop: { p99Ms: telemetry.loop.percentile(99) / 1e6, maxMs: telemetry.loop.max / 1e6 },
    latencyBucketUpperBoundsMs: [...boundaries, null],
    metrics: Object.fromEntries(telemetry.metrics),
    maintenance: telemetry.maintenance,
    admission: admissionSnapshot(),
  }
}

// Builders remain lazy. A transaction owns one permit through commit or rollback; its statements
// use that permit. Individual executions retain theirs until the driver's real promise settles.
export function instrumentDatabase<T extends object>(
  database: T,
  admission = { runDatabaseWork: withDatabaseAdmission, assertRequestActive },
): T {
  const proxies = new WeakMap<object, Map<string, object>>()
  const rawExecutions = new WeakMap<object, Promise<unknown>>()
  function execute(work: () => unknown, operation: string, transactionOwned: boolean) {
    return observe(
      `db:${operation}`,
      () => {
        admission.assertRequestActive()
        return transactionOwned ? work() : admission.runDatabaseWork(work)
      },
      true,
    )
  }
  function wrap(
    target: object,
    operation: string,
    transactionOwned = false,
    databaseObject = false,
  ): object {
    const variant = `${operation}:${transactionOwned}:${databaseObject}`
    let variants = proxies.get(target)
    const cached = variants?.get(variant)
    if (cached) return cached
    if (!variants) {
      variants = new Map()
      proxies.set(target, variants)
    }
    const rawQuery = operation === "raw" && typeof Reflect.get(target, "then") === "function"
    function runRaw(method?: string, args: unknown[] = []) {
      let running = rawExecutions.get(target)
      if (!running) {
        running = execute(
          () => {
            if (method) Reflect.apply(Reflect.get(target, method), target, args)
            return Reflect.apply(Reflect.get(target, "then"), target, [])
          },
          "raw",
          transactionOwned,
        )
        rawExecutions.set(target, running)
      }
      return running
    }
    const proxy = new Proxy(target, {
      apply(object, receiver, args) {
        const result = Reflect.apply(object as (...args: unknown[]) => unknown, receiver, args)
        return result &&
          typeof result === "object" &&
          typeof Reflect.get(result, "then") === "function"
          ? wrap(result, operation, transactionOwned)
          : result
      },
      get(object, key) {
        const value = Reflect.get(object, key, object)
        if (key === "$client") return wrap(value, "raw", transactionOwned)
        if (rawQuery && key === "cancel") return value.bind(object)
        if (rawQuery && ["readable", "writable", "cursor"].includes(String(key)))
          return () => {
            throw new Error("Raw streams and cursors require a dedicated database connection.")
          }
        if (rawQuery && ["execute", "forEach", "handle"].includes(String(key)))
          return (...args: unknown[]) => {
            void runRaw(String(key), args).catch(() => {})
            return proxy
          }
        if (
          typeof value === "function" &&
          typeof Reflect.get(object, "then") === "function" &&
          ["then", "catch", "finally"].includes(String(key))
        ) {
          return (...args: unknown[]) => {
            const running = rawQuery
              ? runRaw()
              : execute(
                  () => Reflect.apply(Reflect.get(object, "then"), object, []),
                  operation,
                  transactionOwned,
                )
            return Reflect.apply(Reflect.get(running, key), running, args)
          }
        }
        // LISTEN retains its pre-existing dedicated connection. It is not a query lease.
        if (operation === "raw" && ["listen", "end"].includes(String(key)))
          return typeof value === "function" ? value.bind(object) : value
        if (operation === "raw" && key === "reserve")
          return () => {
            throw new Error("Use database.transaction() instead of reserving a raw connection.")
          }
        if (operation === "raw" && key === "notify")
          return (...args: unknown[]) =>
            execute(() => Reflect.apply(value, object, args), "notify", transactionOwned)
        if (key === "query" && value && typeof value === "object")
          return wrap(value, "query", transactionOwned)
        if (typeof value !== "function" || typeof key !== "string") {
          if (operation === "query" && value && typeof value === "object")
            return wrap(value, operation, transactionOwned)
          return value
        }
        if (
          ["execute", "all", "get", "run"].includes(key) &&
          !(databaseObject && key === "execute")
        )
          return (...args: unknown[]) =>
            execute(() => Reflect.apply(value, object, args), operation, transactionOwned)
        if (operation === "raw" && ["begin", "savepoint"].includes(key))
          return (...args: unknown[]) => {
            const work = () => {
              admission.assertRequestActive()
              return Reflect.apply(
                value,
                object,
                args.map((arg) =>
                  typeof arg === "function"
                    ? (client: object) => arg(wrap(client, "raw", true))
                    : arg,
                ),
              )
            }
            return transactionOwned ? work() : admission.runDatabaseWork(work)
          }
        if (key === "transaction")
          return (callback: (tx: object) => unknown, ...args: unknown[]) => {
            const work = () => {
              admission.assertRequestActive()
              const started = performance.now()
              return Reflect.apply(value, object, [
                (tx: object) => {
                  recordMetric("db:transaction_acquire", performance.now() - started)
                  return callback(wrap(tx, "execute", true, true))
                },
                ...args,
              ])
            }
            return transactionOwned ? work() : admission.runDatabaseWork(work)
          }
        return (...args: unknown[]) => {
          const result = Reflect.apply(value, object, args)
          if (
            result &&
            typeof result === "object" &&
            ["then", "from", "where", "values", "set", "execute", "findMany", "findFirst"].some(
              (method) => typeof Reflect.get(result, method) === "function",
            )
          )
            return wrap(result, operation === "execute" ? key : operation, transactionOwned)
          return result
        }
      },
    })
    variants.set(variant, proxy)
    return proxy
  }
  return wrap(database, "execute", false, true) as T
}
