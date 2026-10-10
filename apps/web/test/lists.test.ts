import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { pasteFile } from "@workspace/db/schema"
import { getDb } from "@/lib/db"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { listOwnPastes, listStarred, listTrash, setStarred } from "@/lib/pastes/store"
import { hasDatabase, marker, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The lists and the dashboard only need each paste's title, size and settings, so they must not
// load (or send) file contents, and their stars come from one query.

const describeDb = hasDatabase ? describe : describe.skip

function contains(value: unknown, text: string, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") return value.includes(text)
  if (typeof value !== "object" || value === null || seen.has(value)) return false
  seen.add(value)
  return Object.values(value).some((child) => contains(child, text, seen))
}

describeDb("lists", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  test("summaries carry size and language but no file contents", async () => {
    const { id } = await seedPaste({ slug: "multi", owner: "owner", content: "héllo" })
    await getDb()
      .insert(pasteFile)
      .values({ pasteId: id, position: 1, name: "b.ts", language: "typescript", content: "abc" })

    const [summary] = await listOwnPastes()
    expect(summary?.bytes).toBe(new TextEncoder().encode("héllo").length + 3)
    expect(summary?.language).toBe("text")
    expect(contains(summary, "héllo")).toBe(false)
    expect(summary).not.toHaveProperty("files")
    expect(summary).not.toHaveProperty("password")
  })

  test("marks the viewer's stars and keeps contents out of starred and trash lists", async () => {
    await seedPaste({ slug: "a", owner: "owner" })
    await seedPaste({ slug: "b", owner: "owner" })
    await seedPaste({ slug: "gone", owner: "owner", deletedAt: new Date() })
    await setStarred("a", true)

    const own = await listOwnPastes()
    expect(Object.fromEntries(own.map((paste) => [paste.slug, paste.starred]))).toEqual({
      a: true,
      b: false,
    })
    const starred = await listStarred()
    expect(starred.map((paste) => paste.slug)).toEqual(["a"])
    expect(contains(starred, marker("a"))).toBe(false)

    const trash = await listTrash()
    expect(trash.map((paste) => paste.slug)).toEqual(["gone"])
    expect(contains(trash, marker("gone"))).toBe(false)
  })

  test("the dashboard sends the newest five of each tab, not every paste", async () => {
    for (let index = 0; index < 8; index++) {
      await seedPaste({ slug: `pub${index}`, owner: "owner", visibility: "public" })
    }
    await seedPaste({ slug: "priv", owner: "owner", visibility: "private" })

    const data = await getDashboardData()
    expect(data.totalPastes).toBe(9)
    const slugs = data.recent.map((row) => row.slug)
    expect(slugs).toHaveLength(6)
    expect(slugs).toContain("priv")
    expect(contains(data, marker("pub0"))).toBe(false)
  })
})
