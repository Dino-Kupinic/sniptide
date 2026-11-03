import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import {
  accountUsage,
  apiToken,
  apiTokenUsageDay,
  collection,
  paste,
  pasteFile,
  user,
} from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { POST as createRoute } from "@/app/api/v1/pastes/route"
import { GET as usageRoute } from "@/app/api/v1/usage/route"
import {
  getAccountUsage,
  reconcileAccountUsage,
  reconcileUsageBatch,
  recordApiRequest,
} from "@/lib/account/usage"
import { createToken, revokeToken } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { restoreRevision, savePaste, trashPaste } from "@/lib/pastes/actions"
import { getPaste } from "@/lib/pastes/store"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const data = (content = "é🙂", files = [{ name: "a.txt", content }]) => ({
  title: "Usage",
  description: "",
  files,
  visibility: "unlisted" as const,
  expiry: "never" as const,
  slug: "",
  collection: null,
  password: null,
  burnAfterRead: false,
})

async function totals(owner = "ada") {
  const { storageBytes, pasteCount, fileCount, collectionCount } = await getAccountUsage(owner)
  return { storageBytes, pasteCount, fileCount, collectionCount }
}

async function save(content = "é🙂", slug?: string) {
  const result = await savePaste(data(content), slug)
  if (!result.ok) throw new Error(result.error)
  return result.slug
}

function request(token?: string, init: RequestInit = {}) {
  return new Request("http://localhost/api/v1/usage", {
    ...init,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

describeDb("account usage", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("grace")
    signInAs("ada")
  })
  afterAll(resetDatabase)

  test("counts Unicode content, file replacements, revisions, collections and retained trash", async () => {
    const result = await savePaste(
      data("", [
        { name: "a.txt", content: "é🙂" },
        { name: "b.txt", content: "x" },
      ]),
    )
    if (!result.ok) throw new Error(result.error)
    const first = await getPaste(result.slug)
    await getDb().insert(collection).values({ ownerId: "ada", slug: "test", name: "Test" })
    expect(await totals()).toEqual({
      storageBytes: 7,
      pasteCount: 1,
      fileCount: 2,
      collectionCount: 1,
    })
    await save("new", result.slug)
    expect(await totals()).toEqual({
      storageBytes: 3,
      pasteCount: 1,
      fileCount: 1,
      collectionCount: 1,
    })
    expect((await restoreRevision(result.slug, first?.revisions[0]?.id ?? -1)).ok).toBe(true)
    expect(await totals()).toEqual({
      storageBytes: 7,
      pasteCount: 1,
      fileCount: 2,
      collectionCount: 1,
    })
    await trashPaste(result.slug)
    expect(await totals()).toEqual({
      storageBytes: 7,
      pasteCount: 1,
      fileCount: 2,
      collectionCount: 1,
    })
    await getDb().delete(collection).where(eq(collection.ownerId, "ada"))
    await getDb().execute(sql`DELETE FROM paste WHERE owner_id = 'ada'`)
    expect(await totals()).toEqual({
      storageBytes: 0,
      pasteCount: 0,
      fileCount: 0,
      collectionCount: 0,
    })
  })

  test("rolls back deltas with the mutation and transfers ownership", async () => {
    await expect(
      getDb().transaction(async (tx) => {
        await tx.insert(paste).values({
          ownerId: "ada",
          slug: "rollback",
          title: "Rollback",
          visibility: "private",
          bytes: 10,
        })
        throw new Error("rollback")
      }),
    ).rejects.toThrow("rollback")
    expect((await totals()).pasteCount).toBe(0)
    const slug = await save()
    await getDb().update(paste).set({ ownerId: "grace" }).where(eq(paste.slug, slug))
    expect(await totals()).toEqual({
      storageBytes: 0,
      pasteCount: 0,
      fileCount: 0,
      collectionCount: 0,
    })
    expect(await totals("grace")).toEqual({
      storageBytes: 6,
      pasteCount: 1,
      fileCount: 1,
      collectionCount: 0,
    })
    await getDb().delete(user).where(eq(user.id, "grace"))
    expect(
      await getDb().select().from(accountUsage).where(eq(accountUsage.ownerId, "grace")),
    ).toEqual([])
    expect(await getDb().select().from(pasteFile)).toEqual([])
  })

  test("reconciliation repairs counters and remains equal to incremental usage", async () => {
    await save()
    const expected = await totals()
    await getDb()
      .update(accountUsage)
      .set({ storageBytes: 999, pasteCount: 999, fileCount: 999, collectionCount: 999 })
      .where(eq(accountUsage.ownerId, "ada"))
    expect(await reconcileAccountUsage("ada")).toBe(true)
    expect(await totals()).toEqual(expected)
    await getDb()
      .update(accountUsage)
      .set({ reconciledAt: new Date(0), fileCount: 99 })
      .where(eq(accountUsage.ownerId, "ada"))
    expect(await reconcileUsageBatch()).toBe(1)
    expect(await totals()).toEqual(expected)
    expect(await reconcileUsageBatch()).toBe(0)
  })

  test("reconciliation waits for a concurrent edit and recounts its committed data", async () => {
    const slug = await save("one")
    let release!: () => void
    let locked!: () => void
    const acquired = new Promise<void>((resolve) => {
      locked = resolve
    })
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const edit = getDb().transaction(async (tx) => {
      await tx.update(paste).set({ bytes: 8 }).where(eq(paste.slug, slug))
      locked()
      await held
    })
    await acquired
    const recount = reconcileAccountUsage("ada")
    let observedWait = false
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const [waiting] = await getDb().execute<{ waiting: boolean }>(
          sql`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'select "owner_id" from "account_usage"%') AS waiting`,
        )
        if (waiting?.waiting) {
          observedWait = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    } finally {
      release()
    }
    await Promise.all([recount, edit])
    expect(observedWait).toBe(true)
    expect((await totals()).storageBytes).toBe(8)
  })

  test("records daily token counts atomically at UTC midnight and preserves revoked history", async () => {
    const token = await createToken("ada", { name: "Usage", write: false, expiry: "never" })
    if (!token.ok) throw new Error(token.error)
    const owner = { userId: "ada", tokenId: token.summary.id, scopes: ["read" as const] }
    const now = new Date("2026-10-25T00:00:00Z")
    await recordApiRequest(owner, new Date(now.getTime() - 1))
    await Promise.all(Array.from({ length: 20 }, () => recordApiRequest(owner, now)))
    const usage = await getAccountUsage("ada", now)
    expect(usage.apiRequests).toEqual([
      { tokenId: owner.tokenId, day: Math.floor(now.getTime() / DAY) - 1, requests: 1 },
      { tokenId: owner.tokenId, day: Math.floor(now.getTime() / DAY), requests: 20 },
    ])
    await revokeToken("ada", owner.tokenId)
    expect((await getAccountUsage("ada", now)).apiRequests).toEqual(usage.apiRequests)
    expect((await getAccountUsage("grace", now)).apiRequests).toEqual([])
    await reconcileAccountUsage("ada")
    expect((await getAccountUsage("ada", now)).apiRequests).toEqual(usage.apiRequests)
  })

  test("usage API includes itself, rejects invalid credentials and counts valid-token errors", async () => {
    const token = await createToken("ada", { name: "Read", write: false, expiry: "never" })
    if (!token.ok) throw new Error(token.error)
    expect((await usageRoute(request())).status).toBe(401)
    expect((await usageRoute(request("snpt_invalid-token-credentials"))).status).toBe(401)
    const response = await usageRoute(request(token.token))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect((await response.json()).apiRequests[0].requests).toBe(1)
    expect((await createRoute(request(token.token, { method: "POST", body: "{}" }))).status).toBe(
      403,
    )
    expect((await getAccountUsage("ada")).apiRequests[0]?.requests).toBe(2)
    await getDb()
      .update(apiToken)
      .set({ expiresAt: new Date(0) })
      .where(eq(apiToken.id, token.summary.id))
    expect((await usageRoute(request(token.token))).status).toBe(401)
    expect((await getAccountUsage("ada")).apiRequests[0]?.requests).toBe(2)
    await getDb().delete(user).where(eq(user.id, "ada"))
    expect(await getDb().select().from(apiTokenUsageDay)).toEqual([])
  })
})
