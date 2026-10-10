import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { paste, pasteFile } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { importGist, type SavePasteInput, savePaste } from "@/lib/pastes/actions"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

// The server actions behind the editor and the gist import: the same limits for both, and a
// bound on how much one account can create.

const describeDb = hasDatabase ? describe : describe.skip

const GIST = "aa11bb22cc33dd44ee55"
const realFetch = globalThis.fetch

function serveGist(body: unknown, status = 200) {
  globalThis.fetch = mock(async () => Response.json(body, { status })) as unknown as typeof fetch
}

const input = (title: string): SavePasteInput => ({
  title,
  description: "",
  files: [{ name: "a.txt", content: "hello" }],
  visibility: "unlisted",
  expiry: "never",
  slug: "",
  collection: null,
  password: null,
  burnAfterRead: false,
})

async function pasteCount() {
  return (await getDb().select().from(paste)).length
}

describeDb("paste actions", () => {
  afterAll(resetDatabase)
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  describe("importGist", () => {
    test("refuses a gist over the 512 KB paste limit and stores nothing", async () => {
      const big = "x".repeat(300 * 1024)
      serveGist({
        description: "big",
        files: {
          "a.txt": { filename: "a.txt", content: big },
          "b.txt": { filename: "b.txt", content: big },
        },
      })

      const result = await importGist(GIST)
      expect(result).toEqual({ ok: false, error: "Pastes are limited to 512 KB." })
      expect(await pasteCount()).toBe(0)
    })

    test("gist and editor saves reject non-ASCII content above the byte limit", async () => {
      const big = "é".repeat(300 * 1024)
      serveGist({ description: "utf8", files: { "a.txt": { filename: "a.txt", content: big } } })
      expect(await importGist(GIST)).toEqual({ ok: false, error: "Pastes are limited to 512 KB." })
      const editor = input("utf8")
      editor.files = [{ name: "a.txt", content: big }]
      expect(await savePaste(editor)).toEqual({ ok: false, error: "Pastes are limited to 512 KB." })
      expect(await pasteCount()).toBe(0)
    })

    test("refuses file names longer than the editor allows", async () => {
      const name = `${"n".repeat(200)}.txt`
      serveGist({ description: null, files: { [name]: { filename: name, content: "hi" } } })

      expect((await importGist(GIST)).ok).toBe(false)
      expect(await pasteCount()).toBe(0)
    })

    test("shortens a long description to the title limit", async () => {
      serveGist({
        description: "d".repeat(500),
        files: { "a.ts": { filename: "a.ts", content: "export {}" } },
      })

      const result = await importGist(GIST)
      expect(result.ok).toBe(true)
      const [row] = await getDb().select().from(paste)
      expect(row?.title).toHaveLength(120)
      const [file] = await getDb()
        .select()
        .from(pasteFile)
        .where(eq(pasteFile.pasteId, row?.id ?? ""))
      expect(file?.language).toBe("typescript")
    })

    test("is limited to 20 imports an hour", async () => {
      serveGist({ description: "g", files: { "a.txt": { filename: "a.txt", content: "hi" } } })
      for (let index = 0; index < 20; index++) expect((await importGist(GIST)).ok).toBe(true)

      const limited = await importGist(GIST)
      expect(limited.ok).toBe(false)
      expect(await pasteCount()).toBe(20)
    })

    test("reports GitHub being unreachable instead of throwing", async () => {
      globalThis.fetch = mock(async () => {
        throw new DOMException("timed out", "TimeoutError")
      }) as unknown as typeof fetch
      expect(await importGist(GIST)).toEqual({
        ok: false,
        error: "GitHub didn't answer. Try again in a minute.",
      })
    })
  })

  describe("savePaste", () => {
    test("creates at most 30 pastes an hour per account", async () => {
      for (let index = 0; index < 30; index++) {
        expect((await savePaste(input(`paste ${index}`))).ok).toBe(true)
      }
      const limited = await savePaste(input("one too many"))
      expect(limited.ok).toBe(false)
      expect(await pasteCount()).toBe(30)

      // Another account has its own allowance.
      await seedUser("other")
      signInAs("other")
      expect((await savePaste(input("other's paste"))).ok).toBe(true)
    })

    test("needs a signed-in account", async () => {
      signInAs(null)
      await expect(savePaste(input("anonymous"))).rejects.toThrow()
      await expect(importGist(GIST)).rejects.toThrow()
    })
  })
})
