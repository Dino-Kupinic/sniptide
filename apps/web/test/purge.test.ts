import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { authRateLimit, paste, pasteFile, rateLimit } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { purgeStaleData } from "@/lib/pastes/purge"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser } from "./harness"

const DAY = 86_400_000
const describeDb = hasDatabase ? describe : describe.skip

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY)
}

describeDb("purge", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
  })

  test("deletes pastes trashed or burned over 30 days ago, for every owner", async () => {
    await seedUser("other")
    const { id } = await seedPaste({ slug: "old-trash", owner: "owner", burnAfterRead: true })
    await seedPaste({ slug: "other-trash", owner: "other" })
    await seedPaste({ slug: "new-trash", owner: "owner" })
    await seedPaste({ slug: "live", owner: "owner" })
    const db = getDb()
    await db
      .update(paste)
      .set({ deletedAt: daysAgo(31) })
      .where(eq(paste.slug, "old-trash"))
    await db
      .update(paste)
      .set({ deletedAt: daysAgo(40) })
      .where(eq(paste.slug, "other-trash"))
    await db
      .update(paste)
      .set({ deletedAt: daysAgo(29) })
      .where(eq(paste.slug, "new-trash"))

    expect(await purgeStaleData()).toEqual({ trashed: 2, expired: 0 })
    expect(await pasteRow("old-trash")).toBeUndefined()
    expect(await pasteRow("other-trash")).toBeUndefined()
    expect(await pasteRow("new-trash")).toBeDefined()
    expect(await pasteRow("live")).toBeDefined()
    expect(await db.select().from(pasteFile).where(eq(pasteFile.pasteId, id))).toEqual([])
  })

  test("deletes pastes expired over 30 days ago", async () => {
    await seedPaste({ slug: "long-gone", owner: "owner", expiresAt: daysAgo(31) })
    await seedPaste({ slug: "just-expired", owner: "owner", expiresAt: daysAgo(1) })
    await seedPaste({ slug: "future", owner: "owner", expiresAt: new Date(Date.now() + DAY) })

    expect(await purgeStaleData()).toEqual({ trashed: 0, expired: 1 })
    expect(await pasteRow("long-gone")).toBeUndefined()
    expect(await pasteRow("just-expired")).toBeDefined()
    expect(await pasteRow("future")).toBeDefined()
  })

  test("clears rate limit counters older than a day", async () => {
    const db = getDb()
    await db.insert(rateLimit).values([
      { key: "old", count: 3, windowStart: daysAgo(2) },
      { key: "new", count: 3 },
    ])
    await db.insert(authRateLimit).values([
      { id: "a", key: "old", count: 1, lastRequest: Date.now() - 2 * DAY },
      { id: "b", key: "new", count: 1, lastRequest: Date.now() },
    ])

    await purgeStaleData()
    expect((await db.select().from(rateLimit)).map((row) => row.key)).toEqual(["new"])
    expect((await db.select().from(authRateLimit)).map((row) => row.key)).toEqual(["new"])
  })
})
