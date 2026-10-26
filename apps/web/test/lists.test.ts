import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { pasteFile } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { byteLength } from "@/lib/format"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { trashTotals } from "@/lib/pastes/lists"
import { listOwnPastes, listTrash } from "@/lib/pastes/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The lists load summaries: sizes and languages come from SQL, and no file content is sent.

const describeDb = hasDatabase ? describe : describe.skip

describeDb("paste lists", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  test("summaries carry the language and UTF-8 size, not the content", async () => {
    const content = "naïve café ✓"
    await seedPaste({ slug: "live", owner: "owner", content })

    const [summary] = await listOwnPastes()
    expect(summary?.language).toBe("text")
    expect(summary?.bytes).toBe(byteLength(content))
    expect(summary).not.toHaveProperty("files")
    expect(summary).not.toHaveProperty("revisions")
  })

  test("trash lists summaries too", async () => {
    await seedPaste({ slug: "gone", owner: "owner", content: "abc", deletedAt: new Date() })

    const [summary] = await listTrash()
    expect(summary?.slug).toBe("gone")
    expect(summary?.bytes).toBe(3)
  })

  test("summaries and trash totals follow file mutations and omit fileless summaries", async () => {
    const { id } = await seedPaste({
      slug: "gone",
      owner: "owner",
      content: "é",
      deletedAt: new Date(),
    })
    await getDb()
      .insert(pasteFile)
      .values({ pasteId: id, position: 1, name: "b.sql", language: "sql", content: "😀" })
    expect((await listTrash())[0]).toMatchObject({ bytes: 6, language: "text" })
    expect(await trashTotals()).toEqual({ count: 1, bytes: 6 })
    await getDb().update(pasteFile).set({ content: "abcd" }).where(eq(pasteFile.pasteId, id))
    expect((await listTrash())[0]?.bytes).toBe(8)
    expect(await trashTotals()).toEqual({ count: 1, bytes: 8 })
    await getDb().delete(pasteFile).where(eq(pasteFile.pasteId, id))
    expect(await listTrash()).toEqual([])
    expect(await trashTotals()).toEqual({ count: 1, bytes: 0 })
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
  })
})
