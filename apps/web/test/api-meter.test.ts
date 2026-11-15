import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { apiToken, apiTokenUsageDay, paste, rateLimit, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { flushMeter, meterReads, meterRequest, meterTokenUse, resetMeter } from "@/lib/api/meter"
import { createToken, tokenRequestLimit } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

describeDb("token request meter", () => {
  let owner: { userId: string; tokenId: string }
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    const token = await createToken("ada", { name: "Meter", write: false, expiry: "never" })
    if (!token.ok) throw new Error(token.error)
    owner = { userId: "ada", tokenId: token.summary.id }
  })
  const stored = async () => {
    const [row] = await getDb()
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, tokenRequestLimit(owner.tokenId).key))
    return row?.count ?? 0
  }

  test("counts in memory after the first request and writes everything in one flush", async () => {
    const target = await seedPaste({ slug: "read", owner: "ada" })
    const now = new Date()
    const hits = await Promise.all(Array.from({ length: 25 }, () => meterRequest(owner, now)))
    expect(hits.every((counted) => counted.allowed)).toBe(true)
    // Only the request that opened the window reached the database.
    expect(await stored()).toBe(1)
    expect(
      hits.map((counted) => counted.quotas[0]?.remaining).sort((a, b) => (a ?? 0) - (b ?? 0))[0],
    ).toBe(tokenRequestLimit(owner.tokenId).max - 25)
    meterReads([target.id, target.id])
    meterReads([target.id])
    meterTokenUse(owner.tokenId)
    expect(await getDb().select().from(apiTokenUsageDay)).toEqual([])

    await flushMeter()
    expect(await stored()).toBe(25)
    expect(await getDb().select().from(apiTokenUsageDay)).toEqual([
      {
        ownerId: "ada",
        tokenId: owner.tokenId,
        day: Math.floor(now.getTime() / DAY),
        requests: 25,
      },
    ])
    const [counted] = await getDb().select().from(paste).where(eq(paste.id, target.id))
    expect(counted?.agentReads).toBe(2)
    const [token] = await getDb().select().from(apiToken).where(eq(apiToken.id, owner.tokenId))
    expect(token?.lastUsedAt).toBeInstanceOf(Date)

    // A second flush has nothing left to write.
    await flushMeter()
    expect(await stored()).toBe(25)
  })

  test("refuses over the limit without a flush, and learns other processes' hits from one", async () => {
    const limit = tokenRequestLimit(owner.tokenId)
    await getDb()
      .insert(rateLimit)
      .values({ key: limit.key, count: limit.max - 2 })
    expect((await meterRequest(owner)).allowed).toBe(true)
    expect((await meterRequest(owner)).allowed).toBe(true)
    const refused = await meterRequest(owner)
    expect(refused.allowed).toBe(false)
    expect(refused.quotas[0]?.remaining).toBe(0)

    // Another process counts against the same token; this one sees it when it next writes.
    resetMeter()
    await getDb().update(rateLimit).set({ count: 10 }).where(eq(rateLimit.key, limit.key))
    expect((await meterRequest(owner)).quotas[0]?.remaining).toBe(limit.max - 11)
    await getDb().update(rateLimit).set({ count: limit.max }).where(eq(rateLimit.key, limit.key))
    expect((await meterRequest(owner)).allowed).toBe(true)
    await flushMeter()
    expect((await meterRequest(owner)).allowed).toBe(false)
  })

  test("drops usage for an account deleted before the flush", async () => {
    await meterRequest(owner)
    await meterRequest(owner)
    await getDb().delete(apiToken)
    await getDb().delete(user).where(eq(user.id, "ada"))
    await flushMeter()
    expect(await getDb().select().from(apiTokenUsageDay)).toEqual([])
  })
})
