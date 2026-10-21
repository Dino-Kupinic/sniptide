import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste, pasteFile, pasteShare } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { listSharedPage } from "@/lib/pastes/lists"
import { parseSharedListQuery, sharedListSearch } from "@/lib/pastes/shared-list-query"
import { listShared } from "@/lib/pastes/store"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const query = (params: Parameters<typeof parseSharedListQuery>[0] = {}) =>
  parseSharedListQuery(params)
const describeDb = hasDatabase ? describe : describe.skip

async function share(input: Parameters<typeof seedPaste>[0], access: "edit" | "view" = "view") {
  const row = await seedPaste(input)
  await getDb().insert(pasteShare).values({ pasteId: row.id, userId: "viewer", access })
  return row
}

test("shared queries bound untrusted parameters and round-trip bookmarks", () => {
  const parsed = query({
    q: `  ${"a".repeat(200)} `,
    language: ["text,text", "typescript,bogus"],
    owner: ["alice", "x');drop table paste;--"],
    access: "edit,view,bogus",
    sort: "views",
    page: "Infinity",
  })
  expect(parsed).toEqual({
    q: "a".repeat(120),
    languages: ["text", "typescript"],
    owners: ["alice"],
    access: ["edit", "view"],
    sort: "shared",
    page: 1,
  })
  const bookmark = query({
    q: "100% _",
    owner: "alice,bob",
    language: "text",
    access: "edit",
    sort: "title",
    page: "3",
  })
  const params = new URLSearchParams(sharedListSearch(bookmark))
  const restored: Record<string, string[]> = {}
  params.forEach((_, key) => {
    restored[key] = params.getAll(key)
  })
  expect(query(restored)).toEqual(bookmark)
  expect(query({ page: "999999999" }).page).toBe(1_000_000)
  expect(query({ page: "-1", sort: "updated" })).toMatchObject({ page: 1, sort: "updated" })
  expect(query({ owner: Array.from({ length: 60 }, (_, i) => `owner-${i}`) }).owners).toHaveLength(
    50,
  )
})

describeDb("shared pages", () => {
  beforeEach(async () => {
    await resetDatabase()
    for (const id of ["viewer", "alice", "bob", "hidden"]) await seedUser(id)
    signInAs("viewer")
  })
  afterAll(resetDatabase)

  test("bounded pages cover all shares once with stable ties and full-scope facets", async () => {
    const timestamp = new Date("2026-01-01T00:00:00Z")
    for (let i = 0; i < 25; i++) {
      await share({
        slug: `shared-${i}`,
        owner: i < 20 ? "alice" : "bob",
        language: i < 20 ? "text" : "typescript",
        title: "Same title",
      })
    }
    await getDb().update(pasteShare).set({ createdAt: timestamp })
    await getDb().update(paste).set({ updatedAt: timestamp })
    const pages = await Promise.all(
      [1, 2, 3].map((page) => listSharedPage(query({ page: String(page) }))),
    )
    expect(pages.map((page) => page.entries.length)).toEqual([10, 10, 5])
    expect(new Set(pages.flatMap((page) => page.entries.map(({ paste }) => paste.slug))).size).toBe(
      25,
    )
    expect(pages[0]?.pagination).toEqual({ page: 1, pageCount: 3, total: 25, totalAll: 25 })
    expect(pages[0]?.languageOptions).toEqual(["text", "typescript"])
    expect(pages[0]?.ownerOptions.map(({ id }) => id)).toEqual(["alice", "bob"])
    expect(pages[0]?.peopleCount).toBe(2)
    const expected = (await listShared()).map(({ paste }) => paste.slug)
    expect(pages.flatMap((page) => page.entries.map(({ paste }) => paste.slug))).toEqual(expected)
    for (const sort of ["shared", "updated", "title"]) {
      const result = await listSharedPage(query({ sort, page: "999" }))
      expect(result.pagination.page).toBe(3)
      expect(result.entries.map(({ paste }) => paste.slug)).toEqual(expected.slice(20))
      for (const { paste } of result.entries) {
        expect(paste).not.toHaveProperty("files")
        expect(paste.viewsByDay).toEqual([])
      }
    }
  })

  test("search, first-file language, owner and access filter the whole scope", async () => {
    for (let i = 0; i < 11; i++) await share({ slug: `filler-${i}`, owner: "alice" })
    const match = await share(
      { slug: "literal", title: "100% _ \\ done", owner: "bob", language: "typescript" },
      "edit",
    )
    await getDb().insert(pasteFile).values({
      pasteId: match.id,
      position: 1,
      name: "second.py",
      language: "python",
      content: "x",
    })
    const result = await listSharedPage(
      query({ q: "% _ \\", language: "typescript", owner: "bob", access: "edit" }),
    )
    expect(result.entries.map(({ paste }) => paste.slug)).toEqual(["literal"])
    expect(result.pagination).toMatchObject({ total: 1, totalAll: 12 })
    expect(result.peopleCount).toBe(1)
    expect(result.languageOptions).toEqual(["text", "typescript"])
    expect(result.ownerOptions.map(({ id }) => id)).toEqual(["alice", "bob"])
    expect(result.entries[0]?.share.access).toBe("edit")
    expect((await listSharedPage(query({ language: "python" }))).pagination.total).toBe(0)
    expect((await listSharedPage(query({ owner: "bob", access: "view" }))).pagination.total).toBe(0)
    expect((await listSharedPage(query({ q: "missing" }))).peopleCount).toBe(0)
  })

  test("shared time, update time and title each order before paging", async () => {
    for (let i = 0; i < 12; i++) {
      const row = await share({
        slug: `ordered-${i}`,
        owner: "alice",
        title: String(i).padStart(2, "0"),
      })
      await getDb()
        .update(pasteShare)
        .set({ createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000) })
        .where(eq(pasteShare.pasteId, row.id))
      await getDb()
        .update(paste)
        .set({ updatedAt: new Date(Date.UTC(2026, 0, 1) - i * 1000) })
        .where(eq(paste.id, row.id))
    }
    expect((await listSharedPage(query())).entries[0]?.paste.slug).toBe("ordered-11")
    expect((await listSharedPage(query({ sort: "updated" }))).entries[0]?.paste.slug).toBe(
      "ordered-0",
    )
    expect(
      (await listSharedPage(query({ sort: "title", page: "2" }))).entries.map(
        ({ paste }) => paste.slug,
      ),
    ).toEqual(["ordered-10", "ordered-11"])
  })

  test("authorization exclusions apply to rows, counts and facets", async () => {
    await share({ slug: "allowed", owner: "alice", visibility: "private", password: "protected" })
    await share({ slug: "burn", owner: "hidden", burnAfterRead: true, language: "python" })
    await share({ slug: "expired", owner: "hidden", expiresAt: new Date(Date.now() - DAY) })
    await share({ slug: "trash", owner: "hidden", deletedAt: new Date() })
    await share({ slug: "own", owner: "viewer" })
    const left = await share({ slug: "left", owner: "hidden" })
    await getDb()
      .update(pasteShare)
      .set({ leftAt: new Date() })
      .where(eq(pasteShare.pasteId, left.id))
    const revoked = await share({ slug: "revoked", owner: "hidden" })
    await getDb().delete(pasteShare).where(eq(pasteShare.pasteId, revoked.id))
    const foreign = await seedPaste({ slug: "other-viewer", owner: "hidden" })
    await getDb().insert(pasteShare).values({ pasteId: foreign.id, userId: "bob", access: "edit" })
    const result = await listSharedPage(query())
    expect(result.entries.map(({ paste }) => paste.slug)).toEqual(["allowed"])
    expect(result.pagination).toMatchObject({ total: 1, totalAll: 1 })
    expect(result.languageOptions).toEqual(["text"])
    expect(result.ownerOptions.map(({ id }) => id)).toEqual(["alice"])
    expect(result.peopleCount).toBe(1)
    signInAs("bob")
    expect((await listSharedPage(query({ owner: "alice", access: "edit" }))).entries).toEqual([])
    signInAs("hidden")
    expect((await listSharedPage(query())).pagination).toMatchObject({
      total: 0,
      totalAll: 0,
      page: 1,
      pageCount: 1,
    })
    signInAs(null)
    expect(await listSharedPage(query({ page: "3" }))).toMatchObject({
      entries: [],
      ownerOptions: [],
      languageOptions: [],
      peopleCount: 0,
      query: { page: 1 },
      pagination: { total: 0, totalAll: 0 },
    })
  })
})
