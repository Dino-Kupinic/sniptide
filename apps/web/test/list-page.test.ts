import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste, pasteFile, pasteStar, pasteViewDay } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { readRawFile, readSharedPaste } from "@/lib/pastes/store"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs, unlock } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const query = (params: Parameters<typeof parsePasteListQuery>[0] = {}) =>
  parsePasteListQuery(params)

describeDb("bounded paste reads", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
  })

  test("pages cover the owner's pastes once, clamp stale pages, and omit history", async () => {
    for (let i = 0; i < 25; i++) await seedPaste({ slug: `own-${i}`, owner: "owner" })
    await seedPaste({ slug: "foreign", owner: "other" })
    await seedPaste({ slug: "trashed", owner: "owner", deletedAt: new Date() })
    const pages = await Promise.all(
      [1, 2, 3].map((page) => listPastePage({ mode: "mine" }, query({ page: String(page) }))),
    )
    expect(pages.map((page) => page.pastes.length)).toEqual([10, 10, 5])
    expect(new Set(pages.flatMap((page) => page.pastes.map((p) => p.slug))).size).toBe(25)
    expect(pages[0]?.pagination).toMatchObject({ page: 1, pageCount: 3, total: 25, totalAll: 25 })
    for (const page of pages)
      for (const row of page.pastes) {
        expect(row).not.toHaveProperty("files")
        expect(row.viewsByDay).toEqual([])
      }
    expect((await listPastePage({ mode: "mine" }, query({ page: "999" }))).pagination.page).toBe(3)
  })

  test("search is a literal substring, and facets describe the full scope", async () => {
    const one = await seedPaste({
      slug: "one",
      owner: "owner",
      title: "100% complete",
      collection: "notes",
    })
    await getDb()
      .update(pasteFile)
      .set({ language: "typescript" })
      .where(eq(pasteFile.pasteId, one.id))
    await seedPaste({ slug: "two", owner: "owner", title: "Other", visibility: "private" })
    await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true })
    const result = await listPastePage({ mode: "mine" }, query({ q: "%" }))
    expect(result.pastes.map((p) => p.slug)).toEqual(["one"])
    expect(result.languageOptions).toEqual(["text", "typescript"])
    expect(result.pagination.totalAll).toBe(3)
    expect(
      (
        await listPastePage(
          { mode: "mine" },
          query({ language: "typescript", collection: "notes" }),
        )
      ).pastes.map((p) => p.slug),
    ).toEqual(["one"])
    expect(
      (await listPastePage({ mode: "mine" }, query({ visibility: "unlisted" }))).pastes.map(
        (p) => p.slug,
      ),
    ).toEqual(["one"])
    expect(
      (await listPastePage({ mode: "collection", collection: "notes" }, query())).pagination
        .totalAll,
    ).toBe(1)
  })

  test("sorting is applied before paging, including expiration nulls last", async () => {
    for (let i = 0; i < 12; i++) {
      const seeded = await seedPaste({
        slug: `sort-${i}`,
        title: String(i).padStart(2, "0"),
        owner: "owner",
        expiresAt: i === 11 ? undefined : new Date(Date.now() + (12 - i) * DAY),
      })
      await getDb().update(paste).set({ views: i }).where(eq(paste.id, seeded.id))
    }
    expect((await listPastePage({ mode: "mine" }, query({ sort: "views" }))).pastes[0]?.slug).toBe(
      "sort-11",
    )
    expect(
      (await listPastePage({ mode: "mine" }, query({ sort: "title", page: "2" }))).pastes.map(
        (p) => p.slug,
      ),
    ).toEqual(["sort-10", "sort-11"])
    expect(
      (await listPastePage({ mode: "mine" }, query({ sort: "expires", page: "2" }))).pastes.map(
        (p) => p.slug,
      ),
    ).toEqual(["sort-0", "sort-11"])
  })

  test("star counts and pages hide private, expired and password-locked foreign stars", async () => {
    for (const slug of ["open", "private", "expired", "locked"]) {
      const row = await seedPaste({
        slug,
        owner: "other",
        visibility: slug === "private" ? "private" : "unlisted",
        password: slug === "locked" ? "secret" : undefined,
        expiresAt: slug === "expired" ? new Date(Date.now() - DAY) : undefined,
      })
      await getDb().insert(pasteStar).values({ userId: "owner", pasteId: row.id })
    }
    let result = await listPastePage({ mode: "starred" }, query())
    expect(result.pastes.map((p) => p.slug)).toEqual(["open"])
    expect(result.pagination.totalAll).toBe(1)
    await unlock("locked")
    result = await listPastePage({ mode: "starred" }, query({ sort: "title" }))
    expect(result.pastes.map((p) => p.slug)).toEqual(["locked", "open"])
    expect(
      (await listPastePage({ mode: "starred" }, query({ owner: "mine" }))).pagination.total,
    ).toBe(0)
  })

  test("dashboard totals and views aggregate all pastes but recent rows stay bounded", async () => {
    const now = Date.now()
    for (let i = 0; i < 36; i++) {
      const row = await seedPaste({
        slug: `dash-${i}`,
        owner: "owner",
        visibility: ["public", "unlisted", "private"][i % 3] as "public" | "unlisted" | "private",
      })
      await getDb()
        .update(paste)
        .set({ createdAt: new Date(now - 2 * DAY), updatedAt: new Date(now + i) })
        .where(eq(paste.id, row.id))
      await getDb()
        .insert(pasteViewDay)
        .values({ pasteId: row.id, day: Math.floor(now / DAY), views: 2 })
    }
    await seedPaste({ slug: "foreign", owner: "other" })
    await seedPaste({ slug: "deleted", owner: "owner", deletedAt: new Date() })
    const data = await getDashboardData()
    expect(data.totalPastes).toBe(36)
    expect(data.activeLinks).toBe(24)
    expect(data.dailyViews.at(-1)).toBe(72)
    expect(data.newPastes).toEqual({ "1": 0, "7": 36, "30": 36 })
    expect(data.recent.length).toBeLessThanOrEqual(20)
    for (const visibility of ["public", "unlisted", "private"]) {
      expect(data.recent.filter((p) => p.visibility === visibility)).toHaveLength(5)
    }
    expect(data).not.toHaveProperty("pasteCreatedAt")
  })

  test("public DTOs omit hashes/history and raw reads select the named file", async () => {
    const row = await seedPaste({ slug: "multi", owner: "other" })
    await getDb().insert(pasteFile).values({
      pasteId: row.id,
      position: 1,
      name: "b.ts",
      language: "typescript",
      content: "second file",
    })
    const shared = await readSharedPaste("multi")
    expect(shared.status).toBe("ok")
    if (shared.status === "ok") {
      expect(shared.paste).not.toHaveProperty("password")
      expect(shared.paste).not.toHaveProperty("revisions")
      expect(shared.paste).not.toHaveProperty("viewsByDay")
    }
    expect(await readRawFile("multi", "b.ts")).toEqual({
      status: "ok",
      file: { name: "b.ts", language: "typescript", content: "second file" },
    })
    expect((await readRawFile("multi", "missing")).status).toBe("ok")
  })
})
