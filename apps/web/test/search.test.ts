import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste, pasteFile } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { GET } from "@/app/api/search/route"
import { getDb } from "@/lib/db"
import { searchOwnPastes } from "@/lib/pastes/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The ⌘K menu searches the viewer's own pastes the way search_snippets does: every word anywhere
// in the title, slug, description, tags, file names or code.

const describeDb = hasDatabase ? describe : describe.skip

async function seedAt(slug: string, title: string, owner: string, day: number) {
  await seedPaste({ slug, title, owner })
  await getDb()
    .update(paste)
    .set({ updatedAt: new Date(Date.UTC(2026, 0, day)) })
    .where(eq(paste.slug, slug))
}

describeDb("command menu search", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
  })

  test("finds titles and slugs, latest first, case-insensitively", async () => {
    await seedAt("Rk4t9Z", "API rate limiter", "ada", 3)
    await seedAt("Mw2n6A", "fetch-api.ts", "ada", 2)
    await seedAt("Hs7d1B", "openapi.yaml", "ada", 1)
    await seedAt("api-notes", "Meeting notes", "ada", 4)
    await seedAt("k7Qe2x", "useDebounce hook", "ada", 5)

    const { hits, total } = await searchOwnPastes("API")
    expect(hits.map((hit) => hit.slug)).toEqual(["api-notes", "Rk4t9Z", "Mw2n6A", "Hs7d1B"])
    expect(total).toBe(4)
    expect(hits[0]).toEqual({
      slug: "api-notes",
      title: "Meeting notes",
      updatedAt: Date.UTC(2026, 0, 4),
      match: null,
    })
  })

  test("returns a page of hits and counts all of them", async () => {
    for (let i = 0; i < 5; i++) await seedAt(`log-${i}`, `log ${i}`, "ada", i + 1)
    const result = await searchOwnPastes("log", 2)
    expect(result.hits.map((hit) => hit.slug)).toEqual(["log-4", "log-3"])
    expect(result.total).toBe(5)
  })

  test("is limited to the viewer's own pastes that aren't in the trash", async () => {
    await seedPaste({ slug: "mine", title: "shared word", owner: "ada" })
    await seedPaste({ slug: "binned", title: "shared word", owner: "ada", deletedAt: new Date() })
    await seedPaste({ slug: "theirs", title: "shared word", owner: "bob", visibility: "public" })
    expect((await searchOwnPastes("shared")).hits.map((hit) => hit.slug)).toEqual(["mine"])
  })

  test("finds a function name in the code and shows the line it sits on", async () => {
    const { id } = await seedPaste({
      slug: "Bk0ff1",
      title: "Exponential backoff",
      owner: "ada",
      content:
        "// helpers\n\n    export async function retryFetch(url) {\n  setTimeout(go, 100)\n}",
    })
    await getDb().update(pasteFile).set({ name: "retry.ts" }).where(eq(pasteFile.pasteId, id))

    const { hits, total } = await searchOwnPastes("retryFetch")
    expect(total).toBe(1)
    expect(hits[0]?.match).toEqual({
      file: "retry.ts",
      line: 3,
      excerpt: "export async function retryFetch(url) {",
    })
    // Every word has to match somewhere, and the line shown is for a word the title doesn't hold.
    expect((await searchOwnPastes("backoff settimeout")).hits[0]?.match).toMatchObject({
      line: 4,
      excerpt: "setTimeout(go, 100)",
    })
    expect((await searchOwnPastes("backoff missing")).total).toBe(0)
    // A word the title already shows needs no line.
    expect((await searchOwnPastes("backoff")).hits[0]?.match).toBeNull()
  })

  test("finds file names and shows the file without a line", async () => {
    const { id } = await seedPaste({ slug: "cfg", title: "Config", owner: "ada" })
    await getDb()
      .update(pasteFile)
      .set({ name: "docker-compose.yml" })
      .where(eq(pasteFile.pasteId, id))
    expect((await searchOwnPastes("compose")).hits[0]?.match).toEqual({
      file: "docker-compose.yml",
      line: null,
      excerpt: null,
    })
  })

  test("matches an encrypted paste by its title only", async () => {
    await seedPaste({ slug: "sealed", title: "Sealed notes", owner: "ada", content: "ciphertext" })
    await getDb().update(paste).set({ encryptionKeyId: "key-1" }).where(eq(paste.slug, "sealed"))
    expect((await searchOwnPastes("ciphertext")).total).toBe(0)
    expect((await searchOwnPastes("sealed notes")).hits).toMatchObject([
      { slug: "sealed", match: null },
    ])
  })

  test("treats % and _ literally", async () => {
    await seedPaste({ slug: "pct", title: "100% done", owner: "ada", content: "x" })
    await seedPaste({ slug: "plain", title: "1000 done", owner: "ada", content: "x" })
    expect((await searchOwnPastes("0%")).hits.map((hit) => hit.slug)).toEqual(["pct"])
    expect((await searchOwnPastes("_")).hits).toEqual([])
  })

  test("is empty without a query or without a session", async () => {
    await seedPaste({ slug: "mine", owner: "ada" })
    expect(await searchOwnPastes("  ")).toEqual({ hits: [], total: 0 })
    signInAs(null)
    expect(await searchOwnPastes("mine")).toEqual({ hits: [], total: 0 })
  })

  test("the route answers with the same result and is never cached", async () => {
    await seedPaste({ slug: "mine", title: "route me", owner: "ada" })
    const response = await GET(new Request("http://localhost/api/search?q=route"))
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toMatchObject({ total: 1, hits: [{ slug: "mine" }] })
    expect(await (await GET(new Request("http://localhost/api/search"))).json()).toEqual({
      hits: [],
      total: 0,
    })
  })
})
