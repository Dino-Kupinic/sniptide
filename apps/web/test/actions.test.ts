import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { paste, pasteFile } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { byteLength } from "@/lib/format"
import { importGist, previewGist, type SavePasteInput, savePaste } from "@/lib/pastes/actions"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

// The server actions behind the editor and the gist import: the same limits for both, and a
// bound on how much one account can create.

const describeDb = hasDatabase ? describe : describe.skip

const GIST = "aa11bb22cc33dd44ee55"
const KB = 1024
const RAW = "https://gist.githubusercontent.com/octocat/aa11bb22cc33dd44ee55/raw"
const realFetch = globalThis.fetch

let fetched: string[] = []

// Answers the gist API with `body` and raw file URLs from `raw`; anything else is a 404.
function serveGist(body: unknown, raw: Record<string, string> = {}, status = 200) {
  fetched = []
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    const address = String(url)
    fetched.push(address)
    if (address.startsWith("https://api.github.com/gists/")) {
      return Response.json(body, { status })
    }
    const text = raw[address]
    return text === undefined ? new Response("not found", { status: 404 }) : new Response(text)
  }) as unknown as typeof fetch
}

const file = (name: string, content: string) => ({
  filename: name,
  size: byteLength(content),
  content,
})

// What GitHub sends for a file over 1 MB: the size, a raw URL, and a cut-off preview.
const truncated = (name: string, bytes: number, rawUrl = `${RAW}/${name}`) => ({
  filename: name,
  size: bytes,
  raw_url: rawUrl,
  content: "x".repeat(10),
  truncated: true,
})

const gist = (files: Record<string, unknown>, description: string | null = "A gist") => ({
  description,
  updated_at: "2026-10-01T12:00:00Z",
  owner: { login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4" },
  files,
})

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

const choose = (...files: string[]) => ({ id: GIST, files })

async function pasteCount() {
  return (await getDb().select().from(paste)).length
}

describeDb("paste actions", () => {
  afterAll(resetDatabase)
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.MAX_PASTE_SIZE
  })
  beforeEach(async () => {
    fetched = []
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  describe("previewGist", () => {
    test("describes the gist and its files without saving anything", async () => {
      serveGist(gist({ "a.ts": file("a.ts", "export {}"), "b.md": file("b.md", "# hi") }))

      const result = await previewGist(`https://gist.github.com/octocat/${GIST}`)
      expect(result).toEqual({
        ok: true,
        gist: {
          id: GIST,
          owner: {
            login: "octocat",
            avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
            url: "https://github.com/octocat",
          },
          title: "A gist",
          limitBytes: 1024 * KB,
          limitLabel: "1 MB",
          files: [
            { name: "a.ts", size: 9, skipped: null },
            { name: "b.md", size: 4, skipped: null },
          ],
        },
      })
      expect(await pasteCount()).toBe(0)
    })

    test("takes a bare gist id and falls back to the first file name as the title", async () => {
      serveGist(gist({ "a.ts": file("a.ts", "export {}") }, null))
      const result = await previewGist(GIST)
      expect(result.ok && result.gist.title).toBe("a.ts")
    })

    test("rejects text that isn't a gist link", async () => {
      expect((await previewGist("not a gist")).ok).toBe(false)
      expect(fetched).toEqual([])
    })

    test("accepts a 710 KB file under the default 1 MB limit", async () => {
      serveGist(gist({ "big.txt": file("big.txt", "x".repeat(710 * KB)) }))
      const result = await previewGist(GIST)
      expect(result.ok && result.gist.files[0]?.skipped).toBeNull()
    })

    test("leaves out a file over the limit and says why", async () => {
      serveGist(
        gist({
          "small.txt": file("small.txt", "hi"),
          "huge.json": truncated("huge.json", 2048 * KB),
        }),
      )
      const result = await previewGist(GIST)
      expect(result.ok && result.gist.files).toEqual([
        { name: "small.txt", size: 2, skipped: null },
        { name: "huge.json", size: 2048 * KB, skipped: "Over the 1 MB limit." },
      ])
      // Nothing is downloaded just to say it's too big.
      expect(fetched).toEqual([`https://api.github.com/gists/${GIST}`])
    })

    test("follows MAX_PASTE_SIZE", async () => {
      process.env.MAX_PASTE_SIZE = "512KB"
      serveGist(gist({ "big.txt": file("big.txt", "x".repeat(710 * KB)) }))
      const result = await previewGist(GIST)
      expect(result.ok && result.gist.limitLabel).toBe("512 KB")
      expect(result.ok && result.gist.files[0]?.skipped).toBe("Over the 512 KB limit.")
    })

    test("leaves out file names longer than the editor allows", async () => {
      const name = `${"n".repeat(200)}.txt`
      serveGist(gist({ [name]: file(name, "hi") }))
      const result = await previewGist(GIST)
      expect(result.ok && result.gist.files[0]?.skipped).toBe("Name is over 120 characters.")
    })

    test("is limited to 20 reads an hour", async () => {
      serveGist(gist({ "a.txt": file("a.txt", "hi") }))
      for (let index = 0; index < 20; index++) expect((await previewGist(GIST)).ok).toBe(true)
      expect((await previewGist(GIST)).ok).toBe(false)
    })

    test("reports a missing gist and GitHub being unreachable instead of throwing", async () => {
      serveGist({}, {}, 404)
      expect(await previewGist(GIST)).toEqual({
        ok: false,
        error: "That gist doesn't exist or isn't public.",
      })

      globalThis.fetch = mock(async () => {
        throw new DOMException("timed out", "TimeoutError")
      }) as unknown as typeof fetch
      expect(await previewGist(GIST)).toEqual({
        ok: false,
        error: "GitHub didn't answer. Try again in a minute.",
      })
    })
  })

  describe("importGist", () => {
    test("saves only the chosen files, as an unlisted paste", async () => {
      serveGist(
        gist({
          "a.ts": file("a.ts", "export {}"),
          "b.md": file("b.md", "# hi"),
          "c.txt": file("c.txt", "skip me"),
        }),
      )

      const result = await importGist({ id: GIST, files: ["a.ts", "b.md"] })
      expect(result.ok).toBe(true)
      const [row] = await getDb().select().from(paste)
      expect(row?.title).toBe("A gist")
      expect(row?.visibility).toBe("unlisted")
      const files = await getDb()
        .select()
        .from(pasteFile)
        .where(eq(pasteFile.pasteId, row?.id ?? ""))
      expect(files.map((each) => each.name).sort()).toEqual(["a.ts", "b.md"])
      expect(files.find((each) => each.name === "a.ts")?.language).toBe("typescript")
    })

    test("a 710 KB gist imports under the default limit", async () => {
      serveGist(gist({ "big.txt": file("big.txt", "x".repeat(710 * KB)) }))
      expect((await importGist(choose("big.txt"))).ok).toBe(true)
      expect(await pasteCount()).toBe(1)
    })

    test("refuses chosen files that add up to more than the limit and stores nothing", async () => {
      const big = "x".repeat(600 * KB)
      serveGist(gist({ "a.txt": file("a.txt", big), "b.txt": file("b.txt", big) }))

      expect(await importGist(choose("a.txt", "b.txt"))).toEqual({
        ok: false,
        error: "Pastes are limited to 1 MB.",
      })
      expect(await pasteCount()).toBe(0)
      // One of them on its own is fine.
      expect((await importGist(choose("a.txt"))).ok).toBe(true)
    })

    test("refuses a file over the limit, even if the caller asks for it", async () => {
      serveGist(gist({ "huge.json": truncated("huge.json", 2048 * KB) }))
      expect(await importGist(choose("huge.json"))).toEqual({
        ok: false,
        error: "huge.json: Over the 1 MB limit.",
      })
      expect(await pasteCount()).toBe(0)
      expect(fetched).toEqual([`https://api.github.com/gists/${GIST}`])
    })

    test("gist and editor saves reject non-ASCII content above the byte limit", async () => {
      // 600K characters, 1.2 MB of UTF-8: under the limit as text, over it as bytes.
      const big = "é".repeat(600 * KB)
      serveGist(gist({ "a.txt": file("a.txt", big) }))
      const result = await previewGist(GIST)
      expect(result.ok && result.gist.files[0]?.skipped).toBe("Over the 1 MB limit.")

      const editor = input("utf8")
      editor.files = [{ name: "a.txt", content: big }]
      expect(await savePaste(editor)).toEqual({ ok: false, error: "Pastes are limited to 1 MB." })
      expect(await pasteCount()).toBe(0)
    })

    test("fetches a truncated file's full text from its raw URL when it fits", async () => {
      process.env.MAX_PASTE_SIZE = "2MB"
      const full = "line\n".repeat(300 * KB) // 1.5 MB, which GitHub marks truncated
      serveGist(gist({ "log.txt": truncated("log.txt", byteLength(full)) }), {
        [`${RAW}/log.txt`]: full,
      })

      expect((await importGist(choose("log.txt"))).ok).toBe(true)
      const [saved] = await getDb().select().from(pasteFile)
      expect(saved?.content).toBe(full)
    })

    test("only follows raw URLs on GitHub's gist host", async () => {
      process.env.MAX_PASTE_SIZE = "2MB"
      const elsewhere = "https://example.com/raw/log.txt"
      serveGist(gist({ "log.txt": truncated("log.txt", 1500 * KB, elsewhere) }), {
        [elsewhere]: "gotcha",
      })

      const result = await importGist(choose("log.txt"))
      expect(result).toEqual({ ok: false, error: "log.txt: Couldn't be read." })
      expect(fetched).not.toContain(elsewhere)
    })

    test("reports a raw file that can't be fetched", async () => {
      process.env.MAX_PASTE_SIZE = "2MB"
      serveGist(gist({ "log.txt": truncated("log.txt", 1500 * KB) }))
      expect(await importGist(choose("log.txt"))).toEqual({
        ok: false,
        error: "log.txt couldn't be read from GitHub.",
      })
      expect(await pasteCount()).toBe(0)
    })

    test("asks to re-read a gist whose files changed", async () => {
      serveGist(gist({ "a.txt": file("a.txt", "hi") }))
      const result = await importGist(choose("gone.txt"))
      expect(result.ok).toBe(false)
      expect(await pasteCount()).toBe(0)
    })

    test("needs at least one file", async () => {
      serveGist(gist({ "a.txt": file("a.txt", "hi") }))
      expect((await importGist({ id: GIST, files: [] })).ok).toBe(false)
      expect(await pasteCount()).toBe(0)
    })

    test("refuses file names longer than the editor allows", async () => {
      const name = `${"n".repeat(200)}.txt`
      serveGist(gist({ [name]: file(name, "hi") }))

      expect((await importGist(choose(name))).ok).toBe(false)
      expect(await pasteCount()).toBe(0)
    })

    test("shortens a long description to the title limit", async () => {
      serveGist(gist({ "a.ts": file("a.ts", "export {}") }, "d".repeat(500)))

      expect((await importGist(choose("a.ts"))).ok).toBe(true)
      const [row] = await getDb().select().from(paste)
      expect(row?.title).toHaveLength(120)
    })

    test("creates at most 30 pastes an hour, like the editor", async () => {
      serveGist(gist({ "a.txt": file("a.txt", "hi") }))
      for (let index = 0; index < 30; index++)
        expect((await importGist(choose("a.txt"))).ok).toBe(true)

      expect((await importGist(choose("a.txt"))).ok).toBe(false)
      expect(await pasteCount()).toBe(30)
    })

    test("reports GitHub being unreachable instead of throwing", async () => {
      globalThis.fetch = mock(async () => {
        throw new DOMException("timed out", "TimeoutError")
      }) as unknown as typeof fetch
      expect(await importGist(choose("a.txt"))).toEqual({
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
      await expect(previewGist(GIST)).rejects.toThrow()
      await expect(importGist(choose("a.txt"))).rejects.toThrow()
    })
  })
})
