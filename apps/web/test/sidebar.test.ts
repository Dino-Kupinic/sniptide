import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { renamePaste, setStarred } from "@/lib/pastes/actions"
import { sidebarData } from "@/lib/pastes/store"
import { SIDEBAR_RECENT, SIDEBAR_STARRED } from "@/lib/pastes/types"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The sidebar lists the viewer's latest pastes and the first of their stars, with counts for the
// "View all" links, and renames pastes from its ⋯ menu.

const describeDb = hasDatabase ? describe : describe.skip

async function seedMany(owner: string, count: number) {
  for (let i = 0; i < count; i++) {
    await seedPaste({ slug: `${owner}-${i}`, owner, visibility: "public" })
    // Spread the update times so "latest" has a clear order.
    await getDb()
      .update(paste)
      .set({ updatedAt: new Date(Date.UTC(2026, 0, 1 + i)) })
      .where(eq(paste.slug, `${owner}-${i}`))
  }
}

describeDb("sidebar", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
  })

  test("signed out it is empty", async () => {
    signInAs(null)
    expect(await sidebarData()).toEqual({
      counts: { pastes: 0, starred: 0, shared: 0 },
      recent: [],
      starred: [],
    })
  })

  test("lists the latest pastes and the first stars, and counts them all", async () => {
    await seedMany("ada", 10)
    await seedPaste({ slug: "binned", owner: "ada", deletedAt: new Date() })
    for (const slug of ["ada-1", "ada-2", "ada-3", "ada-4"]) await setStarred(slug, true)

    const data = await sidebarData()
    expect(data.counts).toEqual({ pastes: 10, starred: 4, shared: 0 })
    expect(data.recent.map((row) => row.slug)).toEqual(
      Array.from({ length: SIDEBAR_RECENT }, (_, i) => `ada-${9 - i}`),
    )
    expect(data.starred).toHaveLength(SIDEBAR_STARRED)
    expect(data.recent.find((row) => row.slug === "ada-4")?.starred).toBe(true)
    expect(data.recent.find((row) => row.slug === "ada-9")?.starred).toBe(false)
  })

  test("a star on someone else's paste is listed but not theirs to file", async () => {
    await seedPaste({ slug: "bobs", owner: "bob", visibility: "public", collection: "secret" })
    await setStarred("bobs", true)

    const [starred] = (await sidebarData()).starred
    expect(starred).toMatchObject({ slug: "bobs", owned: false, starred: true, collection: null })
  })

  test("renaming changes only the title, and only for the owner", async () => {
    await seedPaste({ slug: "p1", owner: "ada" })
    const before = await pasteRow("p1")

    expect((await renamePaste("p1", "  Fresh title  ")).ok).toBe(true)
    const after = await pasteRow("p1")
    expect(after?.title).toBe("Fresh title")
    expect(after?.slug).toBe("p1")
    expect(after?.updatedAt).toEqual(before?.updatedAt)

    expect((await renamePaste("p1", "   ")).ok).toBe(false)
    expect((await renamePaste("p1", "x".repeat(121))).ok).toBe(false)

    signInAs("bob")
    await renamePaste("p1", "mine now")
    expect((await pasteRow("p1"))?.title).toBe("Fresh title")
  })
})
