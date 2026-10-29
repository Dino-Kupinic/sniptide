import assert from "node:assert/strict"
import { once } from "node:events"
import {
  Agent,
  createServer,
  get,
  type IncomingHttpHeaders,
  request,
  type Server,
  type ServerResponse,
} from "node:http"
import type { Socket } from "node:net"
import test from "node:test"
import { defineRelations, sql } from "drizzle-orm"
import { integer, pgTable } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/postgres-js"
import { getConfig } from "../lib/config"
import { createRequestAdmission, isAdmissionError } from "../lib/request-admission"
import { instrumentDatabase } from "../lib/telemetry"

const limits = {
  http: 1,
  probes: 1,
  streams: 1,
  database: 3,
  databaseQueue: 0,
  databaseProbes: 1,
  databaseMaintenance: 1,
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function server(
  controller: ReturnType<typeof createRequestAdmission>,
  handler: (url: string, response: ServerResponse) => Promise<void> | void,
) {
  const listener = createServer((request, response) =>
    controller.handle(request, response, () => {
      void Promise.resolve()
        .then(() => handler(request.url ?? "/", response))
        .catch(() => {
          response.statusCode = 500
          response.end("framework error")
        })
      return true
    }),
  )
  listener.listen(0, "127.0.0.1")
  await once(listener, "listening")
  const address = listener.address()
  assert(address && typeof address !== "string")
  return { listener, url: `http://127.0.0.1:${address.port}` }
}
async function close(listener: Server) {
  listener.closeAllConnections()
  await new Promise<void>((resolve) => listener.close(() => resolve()))
}

test("finite HTTP admission covers unknown paths, forged bypass headers and probes", async () => {
  const admission = createRequestAdmission(limits, new Set(["/_next/static/hash.js"]))
  const held = deferred()
  const started = deferred()
  const { listener, url } = await server(admission, async (path, response) => {
    if (path === "/hold") {
      started.resolve()
      await held.promise
    }
    response.end("ok")
  })
  try {
    const first = fetch(`${url}/hold`)
    await started.promise
    for (const path of [
      "/unknown",
      "/_next/image",
      "/_next/static/missing.js",
      "/api/health/",
      "/api/health%3f",
    ]) {
      const response = await fetch(`${url}${path}`, {
        headers: {
          rsc: "1",
          purpose: "prefetch",
          "x-middleware-subrequest": "middleware",
          "x-sniptide-maintenance": "true",
        },
      })
      assert.equal(response.status, 503)
      assert.equal(response.headers.get("retry-after"), "1")
      assert.equal(response.headers.get("cache-control"), "private, no-store")
      const body = (await response.json()) as {
        code: string
        error: string
        message: string
        resolution: string
      }
      assert.equal(body.code, "service_unavailable")
      assert.equal(body.message, body.error)
      assert(body.resolution.includes("Retry-After"))
      assert(JSON.stringify(body).length < 512)
    }
    for (const path of ["/api/health", "/api/metrics", "/_next/static/hash.js"]) {
      const response = await fetch(`${url}${path}`)
      assert.equal(response.status, 200)
      await response.text()
    }
    held.resolve()
    assert.equal((await first).status, 200)
    await (await fetch(`${url}/recovered`)).text()
    assert.equal(admission.snapshot().http.normal.active, 0)
    assert.equal(admission.snapshot().http.normal.peak, 1)
    assert.equal(admission.snapshot().http.normal.rejected, 5)
  } finally {
    held.resolve()
    await close(listener)
  }
})

for (const method of ["GET", "POST"]) {
  test(`HTTP ${method} refusals reuse a keepalive connection through recovery`, async () => {
    const admission = createRequestAdmission(limits)
    const held = deferred()
    const started = deferred()
    const agent = new Agent({ keepAlive: true, maxSockets: 1 })
    const { listener, url } = await server(admission, async (path, response) => {
      if (path === "/hold") {
        started.resolve()
        await held.promise
      }
      response.end("ok")
    })
    const first = fetch(`${url}/hold`)
    const send = (path: string) =>
      new Promise<{
        status: number | undefined
        headers: IncomingHttpHeaders
        socket: Socket | null
      }>((resolve, reject) => {
        const body = method === "POST" ? "x".repeat(128 * 1024) : undefined
        const pending = request(
          `${url}${path}`,
          {
            agent,
            method,
            headers: body ? { "content-length": Buffer.byteLength(body) } : undefined,
          },
          (response) => {
            const socket = response.socket
            response.resume()
            response.once("error", reject)
            response.once("end", () =>
              resolve({ status: response.statusCode, headers: response.headers, socket }),
            )
          },
        )
        pending.once("error", reject)
        pending.end(body)
      })
    try {
      await started.promise
      let socket: Socket | undefined
      for (let index = 0; index < 20; index++) {
        const response = await send("/rejected")
        assert.equal(response.status, 503)
        assert.equal(response.headers["retry-after"], "1")
        assert.equal(response.headers["cache-control"], "private, no-store")
        assert(response.socket)
        socket ??= response.socket
        assert(response.socket === socket, "rejected requests must reuse the same socket")
      }
      held.resolve()
      assert.equal((await first).status, 200)
      const recovered = await send("/recovered")
      assert.equal(recovered.status, 200)
      assert(recovered.socket === socket, "recovery must reuse the rejection socket")
    } finally {
      held.resolve()
      await (await first).text()
      agent.destroy()
      await close(listener)
    }
  })
}

test("probe HTTP capacity is separately finite", async () => {
  const admission = createRequestAdmission(limits)
  const held = deferred()
  const started = deferred()
  const { listener, url } = await server(admission, async (path, response) => {
    if (path === "/api/health") {
      started.resolve()
      await held.promise
    }
    response.end("ok")
  })
  try {
    const first = fetch(`${url}/api/health`)
    await started.promise
    assert.equal((await fetch(`${url}/api/metrics`)).status, 503)
    assert.equal((await fetch(`${url}/normal`)).status, 200)
    held.resolve()
    await (await first).text()
    assert.equal(admission.snapshot().http.probe.active, 0)
  } finally {
    held.resolve()
    await close(listener)
  }
})

test("database refusal inside an admitted request survives framework catch as a bounded 503", async () => {
  const admission = createRequestAdmission(limits)
  const hold = deferred()
  const pending = admission.runDatabaseWork(() => hold.promise)
  const { listener, url } = await server(admission, async (_path, response) => {
    try {
      await admission.runDatabaseWork(async () => "not reached")
    } catch {
      response.statusCode = 500
      response.setHeader("content-encoding", "gzip")
      response.setHeader("content-length", "9999")
      response.writeHead(500)
      response.write("large framework payload")
      response.end("more framework payload")
    }
  })
  try {
    const response = await fetch(url)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get("retry-after"), "1")
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(response.headers.get("content-encoding"), null)
    assert.equal(((await response.json()) as { ok: boolean }).ok, false)
    assert.equal(admission.snapshot().database.normal?.active, 1)
  } finally {
    hold.resolve()
    await pending
    await close(listener)
  }
})

test("disconnect releases HTTP once while actual database work stays charged and further work is refused", async () => {
  const admission = createRequestAdmission(limits)
  const hold = deferred()
  const started = deferred()
  const completed = deferred()
  let submissions = 0
  const { listener, url } = await server(admission, async (_path, response) => {
    await admission.runDatabaseWork(async () => {
      submissions++
      started.resolve()
      await hold.promise
    })
    try {
      await admission.runDatabaseWork(async () => {
        submissions++
      })
    } catch (error) {
      assert(isAdmissionError(error))
    }
    response.end("done")
    completed.resolve()
  })
  try {
    const request = get(url)
    request.on("error", () => {})
    await started.promise
    const closed = new Promise<void>((resolve) => request.once("close", () => resolve()))
    request.destroy()
    await closed
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(admission.snapshot().http.normal.active, 0)
    assert.equal(admission.snapshot().database.normal?.active, 1)
    await assert.rejects(
      admission.runDatabaseWork(async () => null),
      isAdmissionError,
    )
    hold.resolve()
    await completed.promise
    assert.equal(submissions, 1)
    assert.equal(admission.snapshot().database.normal?.active, 0)
    assert.equal(admission.snapshot().aborted, 1)
    assert.equal(admission.snapshot().abortedDatabase, 1)
  } finally {
    hold.resolve()
    await close(listener)
  }
})

test("database reserves fit the pool and pressure sampling fails closed", async () => {
  const admission = createRequestAdmission(limits)
  const hold = deferred()
  const normal = admission.runDatabaseWork(() => hold.promise)
  const maintenance = admission.runMaintenanceWork(() =>
    admission.runDatabaseWork(() => hold.promise),
  )
  await assert.rejects(
    Promise.resolve(
      admission.runMaintenanceWork(() => admission.runDatabaseWork(async () => null)),
    ),
    isAdmissionError,
  )
  const { listener, url } = await server(admission, async (path, response) => {
    if (path === "/api/health") await admission.runDatabaseWork(async () => "probe")
    response.end("ok")
  })
  try {
    assert.equal((await fetch(`${url}/api/health`)).status, 200)
    const remove = admission.registerPressure("queue", () => true)
    assert.equal((await fetch(url)).status, 503)
    assert.equal((await fetch(`${url}/api/health`)).status, 200)
    remove()
    const removeBroken = admission.registerPressure("broken", () => {
      throw Error("sampling failed")
    })
    assert.equal((await fetch(url)).status, 503)
    removeBroken()
    assert.equal((await fetch(url)).status, 200)
  } finally {
    hold.resolve()
    await Promise.all([normal, maintenance])
    await close(listener)
  }
})

test("database pressure after streaming headers is observable and cannot rewrite the sent status", async () => {
  const admission = createRequestAdmission(limits)
  const hold = deferred()
  const pending = admission.runDatabaseWork(() => hold.promise)
  const { listener, url } = await server(admission, async (_path, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.write("data: ready\n\n")
    await assert.rejects(
      admission.runDatabaseWork(async () => null),
      isAdmissionError,
    )
    response.end()
  })
  try {
    const response = await fetch(url)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "data: ready\n\n")
    assert.equal(admission.snapshot().lateDatabaseRejected, 1)
  } finally {
    hold.resolve()
    await pending
    await close(listener)
  }
})

test("Drizzle lazy execution and entire transactions retain real promises without nested permit acquisition", async () => {
  const admission = createRequestAdmission(limits)
  const held = deferred<never[]>()
  const executed = deferred()
  let calls = 0
  const client = Object.assign(() => {}, {
    options: { parsers: {}, serializers: {} },
    unsafe() {
      calls++
      executed.resolve()
      return Object.assign(held.promise, { values: () => held.promise })
    },
    async begin(callback: (tx: unknown) => Promise<unknown>) {
      return callback(client)
    },
    async savepoint(callback: (tx: unknown) => Promise<unknown>) {
      return callback(client)
    },
  })
  const db = instrumentDatabase(drizzle({ client: client as never }), admission)
  const query = db.execute(sql`select 1`)
  assert.equal(calls, 0)
  assert.equal(admission.snapshot().database.normal?.active, 0)
  const running = Promise.resolve(query)
  await executed.promise
  assert.equal(admission.snapshot().database.normal?.active, 1)
  await assert.rejects(Promise.resolve(db.execute(sql`select 2`)), isAdmissionError)
  held.resolve([])
  await running
  assert.equal(admission.snapshot().database.normal?.active, 0)
  const commit = deferred()
  const entered = deferred()
  const transaction = db.transaction(async (tx) => {
    await tx.execute(sql`select 3`)
    await tx.transaction(async (nested) => {
      await nested.execute(sql`select 4`)
    })
    entered.resolve()
    await commit.promise
    return "committed"
  })
  await entered.promise
  assert.equal(admission.snapshot().database.normal?.active, 1)
  await assert.rejects(Promise.resolve(db.execute(sql`select 5`)), isAdmissionError)
  commit.resolve()
  assert.equal(await transaction, "committed")
  assert.equal(admission.snapshot().database.normal?.active, 0)
  assert.equal(admission.snapshot().database.normal?.peak, 1)
})

test("configuration validates capacity and partitions reserves within the pool", () => {
  assert.deepEqual(getConfig({}).admission, {
    http: 64,
    probes: 2,
    streams: 128,
    database: 10,
    databaseQueue: 64,
    databaseProbes: 1,
    databaseMaintenance: 1,
  })
  for (const env of [
    { HTTP_ADMISSION_LIMIT: "0" },
    { HTTP_ADMISSION_LIMIT: "1.5" },
    { PROBE_ADMISSION_LIMIT: "9999" },
    { LIVE_ADMISSION_LIMIT: "0" },
    { LIVE_ADMISSION_LIMIT: "4097" },
    { DATABASE_POOL_SIZE: "0" },
    { DATABASE_POOL_SIZE: "3", DATABASE_MAINTENANCE_RESERVE: "2" },
  ])
    assert.throws(() => getConfig(env), /Invalid configuration/)
})

test("small database pools share a hard total budget without requiring new connections", async () => {
  for (const size of [1, 2]) {
    const admission = createRequestAdmission({
      ...getConfig({ DATABASE_POOL_SIZE: String(size) }).admission,
      databaseQueue: 0,
    })
    const hold = deferred()
    const normal = admission.runDatabaseWork(() => hold.promise)
    if (size === 1)
      await assert.rejects(
        Promise.resolve(
          admission.runMaintenanceWork(() => admission.runDatabaseWork(async () => null)),
        ),
        isAdmissionError,
      )
    else await admission.runMaintenanceWork(() => admission.runDatabaseWork(async () => null))
    assert((admission.snapshot().database.total?.peak ?? Infinity) <= size)
    hold.resolve()
    await normal
  }
})

test("bounded FIFO waits through streamed headers and removes disconnected queued work", async () => {
  const admission = createRequestAdmission({ ...limits, http: 3, databaseQueue: 1 })
  const hold = deferred()
  const pending = admission.runDatabaseWork(() => hold.promise)
  const queued = deferred()
  let submissions = 0
  const { listener, url } = await server(admission, async (_path, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.write("data: ready\n\n")
    const work = admission.runDatabaseWork(async () => {
      submissions++
    })
    queued.resolve()
    await work
    response.end("data: done\n\n")
  })
  try {
    const response = await fetch(url)
    await queued.promise
    assert.equal(admission.snapshot().databaseQueue.active, 1)
    await assert.rejects(
      admission.runDatabaseWork(async () => null),
      isAdmissionError,
    )
    hold.resolve()
    await pending
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "data: ready\n\ndata: done\n\n")
    assert.equal(submissions, 1)
    assert.equal(admission.snapshot().databaseQueue.peak, 1)
    assert.equal(admission.snapshot().databaseQueue.active, 0)
  } finally {
    hold.resolve()
    await pending
    await close(listener)
  }
})

test("disconnect removes a queued execution before it reaches the driver", async () => {
  const admission = createRequestAdmission({ ...limits, databaseQueue: 1 })
  const hold = deferred()
  const pending = admission.runDatabaseWork(() => hold.promise)
  const queued = deferred()
  const cancelled = deferred()
  let submissions = 0
  const { listener, url } = await server(admission, async (_path, response) => {
    const work = admission.runDatabaseWork(async () => {
      submissions++
    })
    queued.resolve()
    await assert.rejects(work, isAdmissionError)
    response.end()
    cancelled.resolve()
  })
  try {
    const request = get(url)
    request.on("error", () => {})
    await queued.promise
    assert.equal(admission.snapshot().databaseQueue.active, 1)
    request.destroy()
    await cancelled.promise
    assert.equal(admission.snapshot().databaseQueue.active, 0)
    assert.equal(admission.snapshot().databaseQueue.aborted, 1)
    hold.resolve()
    await pending
    assert.equal(submissions, 0)
    await admission.runDatabaseWork(async () => null)
  } finally {
    hold.resolve()
    await pending
    await close(listener)
  }
})

test("reserved lanes can run while the normal FIFO is waiting", async () => {
  const admission = createRequestAdmission({ ...limits, databaseQueue: 2 })
  const hold = deferred()
  const order: number[] = []
  const first = admission.runDatabaseWork(() => hold.promise)
  const second = admission.runDatabaseWork(async () => {
    order.push(2)
  })
  const third = admission.runDatabaseWork(async () => {
    order.push(3)
  })
  await admission.runMaintenanceWork(() =>
    admission.runDatabaseWork(async () => {
      order.push(1)
    }),
  )
  assert.deepEqual(order, [1])
  hold.resolve()
  await Promise.all([first, second, third])
  assert.deepEqual(order, [1, 2, 3])
  assert.equal(admission.snapshot().database.total?.peak, 2)
})

test("postgres Promise subclasses remain lazy and all execution paths share the real settlement", async () => {
  const admission = createRequestAdmission(limits)
  const hold = deferred<unknown[]>()
  let submitted = 0
  let cancelled = 0
  class Query extends Promise<unknown[]> {
    static get [Symbol.species]() {
      return Promise
    }
    private started = false
    constructor() {
      super((resolve, reject) => hold.promise.then(resolve, reject))
    }
    // biome-ignore lint/suspicious/noThenProperty: postgres.js starts its Promise subclass when then is called.
    then<TResult1 = unknown[], TResult2 = never>(
      resolve?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      if (!this.started) {
        this.started = true
        submitted++
      }
      return super.then(resolve, reject)
    }
    values() {
      return this
    }
    execute() {
      return this
    }
    forEach(_callback: (row: unknown) => void) {
      return this
    }
    cancel() {
      cancelled++
    }
    cursor() {
      return this
    }
    readable() {
      return this
    }
    writable() {
      return this
    }
  }
  type Client = (() => Query) & {
    unsafe: () => Query
    reserve: () => Client
    begin: (callback: (tx: Client) => unknown) => Promise<unknown>
    savepoint: (callback: (tx: Client) => unknown) => Promise<unknown>
  }
  const client: Client = Object.assign(() => new Query(), {
    unsafe: () => new Query(),
    reserve: () => client,
    async begin(callback: (tx: Client) => unknown) {
      return callback(client)
    },
    async savepoint(callback: (tx: Client) => unknown) {
      return callback(client)
    },
  })
  const db = instrumentDatabase({ $client: client }, admission)
  const query = db.$client.unsafe().values()
  assert.equal(submitted, 0)
  const running = query.execute().catch(() => [])
  const same = query.finally(() => {})
  query.cancel()
  assert.equal(cancelled, 1)
  assert.equal(submitted, 1)
  assert.equal(admission.snapshot().database.normal?.active, 1)
  await assert.rejects(
    db.$client.unsafe().catch(() => {
      throw new Error("refused")
    }),
    /refused/,
  )
  await assert.rejects(Promise.resolve(db.$client()), isAdmissionError)
  assert.equal(submitted, 1)
  hold.resolve([])
  await Promise.all([running, same])
  assert.equal(admission.snapshot().database.normal?.active, 0)
  assert.throws(() => Reflect.get(db.$client, "reserve")(), /transaction/)
  for (const method of ["cursor", "readable", "writable"])
    assert.throws(() => Reflect.get(db.$client.unsafe(), method)(), /dedicated database connection/)
  const transaction = db.$client.begin(async (tx) =>
    tx.savepoint(async (nested) => nested.unsafe().catch(() => [])),
  )
  await transaction
  assert.equal(admission.snapshot().database.normal?.peak, 1)
})

test("Drizzle relational queries and prepared executions use admission", async () => {
  const admission = createRequestAdmission(limits)
  const table = pgTable("admission_test", { id: integer().primaryKey() })
  const relations = defineRelations({ table })
  const hold = deferred<never[]>()
  let calls = 0
  const client = Object.assign(() => {}, {
    options: { parsers: {}, serializers: {} },
    unsafe() {
      calls++
      return Object.assign(hold.promise, { values: () => hold.promise })
    },
  })
  const db = instrumentDatabase(drizzle({ client: client as never, relations }), admission)
  const query = db.query.table.findMany()
  assert.equal(calls, 0)
  const running = Promise.resolve(query)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 1)
  assert.equal(admission.snapshot().database.normal?.active, 1)
  await assert.rejects(Promise.resolve(db.query.table.findFirst()), isAdmissionError)
  await assert.rejects(db.select().from(table).prepare("admission").execute(), isAdmissionError)
  assert.equal(calls, 1)
  hold.resolve([])
  await running
  assert.equal(admission.snapshot().database.normal?.active, 0)
})

test("optional postcommit refusal preserves the committed response and mandatory refusal still sends 503", async () => {
  const admission = createRequestAdmission(limits)
  const hold = deferred()
  const pending = admission.runDatabaseWork(() => hold.promise)
  let submissions = 0
  const { listener, url } = await server(admission, async (path, response) => {
    const notify = () =>
      admission.runDatabaseWork(async () => {
        submissions++
      })
    try {
      if (path === "/optional") await admission.runBestEffortWork(notify)
      else {
        await admission.runBestEffortWork(async () => "optional work finished")
        await notify()
      }
    } catch (error) {
      assert(isAdmissionError(error))
    }
    response.statusCode = 201
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ id: "committed" }))
  })
  try {
    const optional = await fetch(`${url}/optional`)
    assert.equal(optional.status, 201)
    assert.deepEqual(await optional.json(), { id: "committed" })
    assert.equal(optional.headers.get("retry-after"), null)
    const mandatory = await fetch(`${url}/mandatory`)
    assert.equal(mandatory.status, 503)
    assert.equal(mandatory.headers.get("retry-after"), "1")
    assert.equal(((await mandatory.json()) as { ok: boolean }).ok, false)
    assert.equal(submissions, 0)
    assert.equal(admission.snapshot().database.total?.active, 1)
    assert.equal(admission.snapshot().database.total?.rejected, 2)
  } finally {
    hold.resolve()
    await pending
    await close(listener)
  }
})

test("optional database work keeps the request abort context and bounded queue", async () => {
  const admission = createRequestAdmission({ ...limits, databaseQueue: 1 })
  const hold = deferred()
  const pending = admission.runDatabaseWork(() => hold.promise)
  const queued = deferred()
  const cancelled = deferred()
  let submissions = 0
  const { listener, url } = await server(admission, async (_path, response) => {
    const work = admission.runBestEffortWork(() =>
      admission.runDatabaseWork(async () => {
        submissions++
      }),
    )
    queued.resolve()
    await assert.rejects(Promise.resolve(work), isAdmissionError)
    await assert.rejects(
      Promise.resolve(
        admission.runBestEffortWork(() =>
          admission.runDatabaseWork(async () => {
            submissions++
          }),
        ),
      ),
      isAdmissionError,
    )
    response.end()
    cancelled.resolve()
  })
  try {
    const request = get(url)
    request.on("error", () => {})
    await queued.promise
    assert.equal(admission.snapshot().databaseQueue.active, 1)
    request.destroy()
    await cancelled.promise
    assert.equal(admission.snapshot().databaseQueue.active, 0)
    assert.equal(admission.snapshot().databaseQueue.aborted, 1)
    hold.resolve()
    await pending
    assert.equal(submissions, 0)
  } finally {
    hold.resolve()
    await pending
    await close(listener)
  }
})

test("live streams have finite HTTP capacity without occupying normal or probe slots", async () => {
  const admission = createRequestAdmission({ ...limits, streams: 1 })
  const hold = deferred()
  const finished = deferred()
  const { listener, url } = await server(admission, async (path, response) => {
    if (path === "/api/live") {
      await admission.runDatabaseWork(async () => "authenticate")
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.write("data: connected\n\n")
      await hold.promise
    }
    response.end("ok")
    if (path === "/api/live") finished.resolve()
  })
  try {
    const request = get(`${url}/api/live`)
    request.on("error", () => {})
    const [stream] = await once(request, "response")
    stream.resume()
    assert.equal((await fetch(`${url}/normal`)).status, 200)
    assert.equal((await fetch(`${url}/api/health`)).status, 200)
    assert.equal((await fetch(`${url}/api/live`)).status, 503)
    assert.equal((await fetch(`${url}/api/live?head`, { method: "HEAD" })).status, 503)
    assert.equal((await fetch(`${url}/api/live?post`, { method: "POST" })).status, 200)
    assert.equal((await fetch(`${url}/api/live/`)).status, 200)
    const removePressure = admission.registerPressure("visits", () => true)
    assert.equal((await fetch(`${url}/normal`)).status, 503)
    assert.equal((await fetch(`${url}/api/metrics`)).status, 200)
    stream.on("error", () => {})
    const disconnected = new Promise<void>((resolve) => stream.once("close", resolve))
    request.destroy()
    await disconnected
    await new Promise((resolve) => setTimeout(resolve, 20))
    hold.resolve()
    await finished.promise
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(admission.snapshot().http.live.active, 0)
    assert.equal((await fetch(`${url}/api/live?pressure`)).status, 503)
    removePressure()
    assert.equal((await fetch(`${url}/api/live?reopened`)).status, 200)
    assert.equal(admission.snapshot().http.live.active, 0)
    assert.equal(admission.snapshot().http.live.peak, 1)
    assert.equal(admission.snapshot().http.normal.peak, 1)
    assert.equal(admission.snapshot().http.probe.peak, 1)
    assert.equal(admission.snapshot().aborted, 1)
    assert.equal(admission.snapshot().database.normal?.peak, 1)
    assert.equal(admission.snapshot().database.total?.peak, 1)
  } finally {
    hold.resolve()
    await close(listener)
  }
})
