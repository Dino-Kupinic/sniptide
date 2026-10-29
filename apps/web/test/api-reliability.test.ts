import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { apiReceipt, apiToken, collection, paste, rateLimit } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { POST as mcp } from "@/app/api/mcp/route"
import { POST as batchCreate } from "@/app/api/v1/batch/route"
import { POST as createCollection } from "@/app/api/v1/collections/route"
import { GET as me } from "@/app/api/v1/me/route"
import { POST as createPaste } from "@/app/api/v1/pastes/route"
import { withToken } from "@/lib/api/http"
import { createToken } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { purgeStaleData } from "@/lib/pastes/purge"
import { hit } from "@/lib/rate-limit"
import { AdmissionError } from "@/lib/request-admission"
import { HOUR_SECONDS } from "@/lib/time"
import { hasDatabase, resetDatabase, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const capture = {
  title: "Retry",
  files: [{ name: "retry.ts", content: "export const retry = true" }],
}
let token: string
let tokenId: string
function call(path: string, body?: unknown, key?: string, bearer = token) {
  return new Request(`http://localhost:3000${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      ...(key === undefined ? {} : { "idempotency-key": key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
async function tokenFor() {
  const result = await createToken("retry-owner", {
    name: "integration",
    write: true,
    expiry: "never",
  })
  if (!result.ok) throw new Error(result.error)
  return result
}

describeDb("API create reliability", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("retry-owner")
    const result = await tokenFor()
    token = result.token
    tokenId = result.summary.id
  })

  test("overload responses preserve retry metadata and the counted token quota", async () => {
    const response = await withToken(call("/api/v1/me"), "read", async () => {
      throw new AdmissionError()
    })
    expect(response.status).toBe(503)
    expect(response.headers.get("retry-after")).toBe("1")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("ratelimit")).toContain('"api-token";r=3599;')
    expect((await response.json()).code).toBe("service_unavailable")
  })

  test("concurrent duplicate paste creates commit one paste and its stored response", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => createPaste(call("/api/v1/pastes", capture, "same-paste"))),
    )
    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201))
    const bodies = await Promise.all(responses.map((response) => response.json()))
    for (const body of bodies) expect(body).toEqual(bodies[0])
    expect((await getDb().select().from(paste)).length).toBe(1)
    const receipts = await getDb().select().from(apiReceipt)
    expect(receipts.length).toBe(1)
    expect(receipts[0]?.response).toEqual(bodies[0])
    expect(responses[0]?.headers.get("ratelimit-policy")).toContain('"paste-create";q=30;w=3600')
  })

  test("concurrent collection creates replay instead of conflicting", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        createCollection(call("/api/v1/collections", { name: "Recipes" }, "same-collection")),
      ),
    )
    expect(responses.map((response) => response.status)).toEqual(Array(5).fill(201))
    const bodies = await Promise.all(responses.map((response) => response.json()))
    for (const body of bodies) expect(body).toEqual(bodies[0])
    expect((await getDb().select().from(collection)).length).toBe(1)
    expect((await getDb().select().from(apiReceipt)).length).toBe(1)
  })

  for (const route of ["pastes", "collections"] as const) {
    test(`a receipt-write failure rolls back ${route} and allows retry`, async () => {
      const db = getDb()
      const handler = route === "pastes" ? createPaste : createCollection
      const body = route === "pastes" ? capture : { name: "Rollback" }
      await db.execute(
        sql`CREATE FUNCTION wrk399_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test receipt failure''; END'`,
      )
      try {
        await db.execute(
          sql`CREATE TRIGGER wrk399_receipt_failure BEFORE INSERT ON api_receipt FOR EACH ROW EXECUTE FUNCTION wrk399_fail_receipt()`,
        )
        expect((await handler(call(`/api/v1/${route}`, body, "rollback"))).status).toBe(500)
        expect((await db.select().from(paste)).length).toBe(0)
        expect((await db.select().from(collection)).length).toBe(0)
        expect((await db.select().from(apiReceipt)).length).toBe(0)
      } finally {
        await db.execute(sql`DROP TRIGGER IF EXISTS wrk399_receipt_failure ON api_receipt`)
        await db.execute(sql`DROP FUNCTION IF EXISTS wrk399_fail_receipt()`)
      }
      expect((await handler(call(`/api/v1/${route}`, body, "rollback"))).status).toBe(201)
      expect((await db.select().from(route === "pastes" ? paste : collection)).length).toBe(1)
      expect((await db.select().from(apiReceipt)).length).toBe(1)
    })
  }

  test("keys reject changed payloads and routes, ignore object order, and belong to one token", async () => {
    const expected = await (await createPaste(call("/api/v1/pastes", capture, "key"))).json()
    const replay = await createPaste(
      call("/api/v1/pastes", { files: capture.files, title: capture.title }, "key"),
    )
    expect(await replay.json()).toEqual(expected)
    expect(
      (await createPaste(call("/api/v1/pastes", { ...capture, title: "Changed" }, "key"))).status,
    ).toBe(409)
    expect(
      (await createCollection(call("/api/v1/collections", { name: "Different route" }, "key")))
        .status,
    ).toBe(409)
    const other = await tokenFor()
    const independent = await createPaste(call("/api/v1/pastes", capture, "key", other.token))
    expect(independent.status).toBe(201)
    expect((await independent.json()).paste.id).not.toBe(expected.paste.id)
  })

  test("replay preserves its original response after edits; expiry and cleanup release the key", async () => {
    const initial = await (await createPaste(call("/api/v1/pastes", capture, "stable"))).json()
    await getDb().update(paste).set({ title: "Edited" }).where(eq(paste.id, initial.paste.id))
    expect(await (await createPaste(call("/api/v1/pastes", capture, "stable"))).json()).toEqual(
      initial,
    )
    await getDb()
      .update(apiReceipt)
      .set({ expiresAt: new Date(Date.now() - 1) })
    const next = await (await createPaste(call("/api/v1/pastes", capture, "stable"))).json()
    expect(next.paste.id).not.toBe(initial.paste.id)
    expect((await getDb().select().from(apiReceipt)).length).toBe(1)
    await getDb()
      .update(apiReceipt)
      .set({ expiresAt: new Date(Date.now() - 1) })
    await purgeStaleData()
    expect((await getDb().select().from(apiReceipt)).length).toBe(0)
  })

  test("replays survive collection deletion and conflicting invalid payloads return 409", async () => {
    await createCollection(call("/api/v1/collections", { name: "Ephemeral" }, "collection-key"))
    const input = { ...capture, collection: "ephemeral" }
    const original = await (
      await createPaste(call("/api/v1/pastes", input, "collection-paste"))
    ).json()
    await getDb().delete(collection).where(eq(collection.slug, "ephemeral"))
    const replay = await createPaste(call("/api/v1/pastes", input, "collection-paste"))
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual(original)
    expect(
      (await createPaste(call("/api/v1/pastes", { title: "Missing files" }, "collection-paste")))
        .status,
    ).toBe(409)
    expect(
      (await createCollection(call("/api/v1/collections", { invalid: true }, "collection-key")))
        .status,
    ).toBe(409)
    expect((await getDb().select().from(paste)).length).toBe(1)
  })

  test("auth, scopes, and actual create windows apply before replay", async () => {
    expect((await createPaste(call("/api/v1/pastes", capture, "protected"))).status).toBe(201)
    await getDb()
      .update(apiToken)
      .set({ scopes: ["read"] })
      .where(eq(apiToken.id, tokenId))
    const forbidden = await createPaste(call("/api/v1/pastes", capture, "protected"))
    expect(forbidden.status).toBe(403)
    expect(forbidden.headers.get("ratelimit")).toContain('"api-token";r=3598;')
    await getDb()
      .update(apiToken)
      .set({ scopes: ["read", "write"] })
      .where(eq(apiToken.id, tokenId))
    await getDb()
      .update(rateLimit)
      .set({ count: 30, windowStart: sql`now() - interval '3550 seconds'` })
      .where(eq(rateLimit.key, "paste:create:retry-owner"))
    const limited = await createPaste(call("/api/v1/pastes", capture, "protected"))
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(45)
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(50)
    expect(limited.headers.get("ratelimit")).toContain('"paste-create";r=0;')
    await getDb().delete(apiToken).where(eq(apiToken.id, tokenId))
    const revoked = await createPaste(call("/api/v1/pastes", capture, "protected"))
    expect(revoked.status).toBe(401)
    expect(revoked.headers.has("ratelimit")).toBe(false)
    expect((await getDb().select().from(apiReceipt)).length).toBe(0)
  })

  test("batch commits ordered partial results, supports dependent creates, and replays", async () => {
    const operations = [
      { operation: "create_collection", key: "collection", body: { name: "Imported" } },
      { operation: "create_paste", key: "paste", body: { ...capture, collection: "imported" } },
      { operation: "create_paste", key: "invalid", body: { title: "No files" } },
      { operation: "create_paste", key: "later", body: capture },
    ]
    const response = await batchCreate(call("/api/v1/batch", { operations }))
    expect(response.status).toBe(207)
    const body = await response.json()
    expect(body.results.map((item: { status: number }) => item.status)).toEqual([
      201, 201, 400, 201,
    ])
    expect(body.results.map((item: { index: number }) => item.index)).toEqual([0, 1, 2, 3])
    expect(body.results[1].body.paste.collection).toBe("imported")
    expect(await (await batchCreate(call("/api/v1/batch", { operations }))).json()).toEqual(body)
    expect((await getDb().select().from(paste)).length).toBe(2)
    expect(
      await (await createPaste(call("/api/v1/pastes", operations[1]?.body, "paste"))).json(),
    ).toEqual(body.results[1].body)
    const [counter] = await getDb()
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, `api:token:${tokenId}`))
    expect(counter?.count).toBe(11)
  })

  test("batch bounds and unsupported operations fail before mutation", async () => {
    for (const operations of [
      [],
      Array(21).fill({ operation: "create_paste", key: "many", body: capture }),
      [{ operation: "fetch", key: "ssrf", body: { url: "http://localhost" } }],
    ]) {
      expect((await batchCreate(call("/api/v1/batch", { operations }))).status).toBe(400)
    }
    expect((await getDb().select().from(paste)).length).toBe(0)
    expect((await createPaste(call("/api/v1/pastes", capture, "x".repeat(129)))).status).toBe(400)
  })

  test("batch enforces token and paste quotas per item without undoing successful items", async () => {
    await getDb()
      .insert(rateLimit)
      .values({ key: `api:token:${tokenId}`, count: 3598 })
    const response = await batchCreate(
      call("/api/v1/batch", {
        operations: [
          { operation: "create_collection", key: "first", body: { name: "First" } },
          { operation: "create_collection", key: "second", body: { name: "Second" } },
        ],
      }),
    )
    expect((await response.json()).results.map((item: { status: number }) => item.status)).toEqual([
      201, 429,
    ])
    expect(response.headers.get("ratelimit")).toContain('"api-token";r=0;')
    expect((await getDb().select().from(collection)).length).toBe(1)
    await getDb().delete(rateLimit)
    await getDb().insert(rateLimit).values({ key: "paste:create:retry-owner", count: 30 })
    const partial = await batchCreate(
      call("/api/v1/batch", {
        operations: [
          { operation: "create_paste", key: "blocked", body: capture },
          { operation: "create_collection", key: "still-allowed", body: { name: "Allowed" } },
        ],
      }),
    )
    expect((await partial.json()).results.map((item: { status: number }) => item.status)).toEqual([
      429, 201,
    ])
  })

  test("atomic quota snapshots count concurrent hits and reset after the real window", async () => {
    const limit = { policy: "concurrent", key: "concurrent", max: 5, windowSeconds: HOUR_SECONDS }
    const hits = await Promise.all(Array.from({ length: 8 }, () => hit([limit])))
    expect(hits.filter((result) => result.allowed).length).toBe(5)
    expect(hits.flatMap((result) => result.quotas.map((quota) => quota.remaining)).sort()).toEqual([
      0, 0, 0, 0, 1, 2, 3, 4,
    ])
    await getDb()
      .update(rateLimit)
      .set({ windowStart: new Date(Date.now() - 3601_000) })
      .where(eq(rateLimit.key, limit.key))
    const fresh = await hit([limit])
    expect(fresh.quotas[0]?.remaining).toBe(4)
    expect(fresh.quotas[0]?.resetSeconds).toBe(3600)
  })

  test("token successes, validation failures, and MCP responses carry their counted quota", async () => {
    const success = await me(call("/api/v1/me"))
    expect(success.headers.get("ratelimit-policy")).toBe('"api-token";q=3600;w=3600')
    expect(success.headers.get("ratelimit")).toContain('"api-token";r=3599;')
    const bad = await createPaste(call("/api/v1/pastes", { invalid: true }))
    expect(bad.status).toBe(400)
    expect(bad.headers.get("ratelimit")).toContain('"api-token";r=3598;')
    const response = await mcp(
      call("/api/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }),
    )
    expect(response.headers.get("ratelimit")).toContain('"api-token";r=3597;')
  })

  test("requests without a valid token carry their own quota and are limited per address", async () => {
    const previous = process.env.CLIENT_IP_SOURCE
    process.env.CLIENT_IP_SOURCE = "x-real-ip"
    try {
      const anonymous = () =>
        me(
          new Request("http://localhost:3000/api/v1/me", {
            headers: { "x-real-ip": "203.0.113.9" },
          }),
        )
      const first = await anonymous()
      expect(first.status).toBe(401)
      expect(first.headers.get("ratelimit-policy")).toBe('"api-unauthenticated";q=60;w=600')
      expect(first.headers.get("ratelimit")).toContain('"api-unauthenticated";r=59;')
      await getDb()
        .update(rateLimit)
        .set({ count: 60 })
        .where(eq(rateLimit.key, "api:unauthenticated:203.0.113.9"))
      const limited = await anonymous()
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
    } finally {
      if (previous === undefined) delete process.env.CLIENT_IP_SOURCE
      else process.env.CLIENT_IP_SOURCE = previous
    }
  })
})
