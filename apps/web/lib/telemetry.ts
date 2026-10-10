import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { type IncomingMessage, Server, type ServerResponse } from "node:http"
import { monitorEventLoopDelay, performance } from "node:perf_hooks"
import { envInteger } from "@workspace/db/config"

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
  telemetry.maintenance = values
}
function route(path = "/") {
  const pathname = path.split("?")[0] ?? "/"
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
  }
}

// Decorate public Drizzle execution boundaries without changing SQL, driver promises or builders.
// Durations include queueing, database execution and mapping. Transaction acquisition is measured separately.
export function instrumentDatabase<T extends object>(database: T): T {
  const proxies = new WeakMap<object, object>()
  function wrap(target: object, operation: string): object {
    const cached = proxies.get(target)
    if (cached) return cached
    const proxy = new Proxy(target, {
      get(object, key) {
        const value = Reflect.get(object, key, object)
        if (typeof value !== "function" || typeof key !== "string") return value
        if (key === "then")
          return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            observe(`db:${operation}`, () => Reflect.apply(value, object, []), true).then(
              resolve,
              reject,
            )
        if (key === "execute")
          return (...args: unknown[]) =>
            observe(`db:${operation}`, () => Reflect.apply(value, object, args), true)
        if (key === "transaction")
          return (callback: (tx: object) => unknown, ...args: unknown[]) => {
            const started = performance.now()
            return Reflect.apply(value, object, [
              (tx: object) => {
                recordMetric("db:transaction_acquire", performance.now() - started)
                return callback(wrap(tx, "execute"))
              },
              ...args,
            ])
          }
        return (...args: unknown[]) => {
          const result = Reflect.apply(value, object, args)
          if (
            result &&
            typeof result === "object" &&
            !(result instanceof Promise) &&
            ["then", "from", "where", "values", "set"].some(
              (method) => typeof Reflect.get(result, method) === "function",
            )
          )
            return wrap(result, operation === "execute" ? key : operation)
          return result
        }
      },
    })
    proxies.set(target, proxy)
    return proxy
  }
  return wrap(database, "execute") as T
}
