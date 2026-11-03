import { afterEach, describe, expect, mock, test } from "bun:test"
import { fetchGist, gistTitle, parseGistId, readGistFiles } from "@/lib/pastes/gist"

// Reading public gists, for the import sheet and for "Open in editor". No database needed: only
// GitHub's answers are faked.

const ID = "aa11bb22cc33dd44ee55"
const realFetch = globalThis.fetch

function serve(body: unknown, raw: Record<string, string> = {}) {
  const fetched: string[] = []
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    const address = String(url)
    fetched.push(address)
    if (address.startsWith("https://api.github.com/gists/")) return Response.json(body)
    const text = raw[address]
    return text === undefined ? new Response("missing", { status: 404 }) : new Response(text)
  }) as unknown as typeof fetch
  return fetched
}

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.MAX_PASTE_SIZE
})

describe("parseGistId", () => {
  test("reads gist URLs and bare ids", () => {
    expect(parseGistId(`https://gist.github.com/octocat/${ID}`)).toBe(ID)
    expect(parseGistId(`gist.github.com/octocat/${ID}/`)).toBe(ID)
    expect(parseGistId(`  ${ID}  `)).toBe(ID)
    expect(parseGistId(`https://gist.github.com/${ID}#file-a-ts`)).toBe(ID)
  })

  test("refuses everything else", () => {
    expect(parseGistId("")).toBeNull()
    expect(parseGistId("https://example.com/octocat")).toBeNull()
    expect(parseGistId("abc123")).toBeNull()
  })
})

describe("fetchGist", () => {
  const gist = (owner: unknown) => ({
    description: "  React hooks  ",
    owner,
    files: { "a.ts": { filename: "a.ts", content: "export {}" } },
  })

  test("returns the owner with a profile link built from the login", async () => {
    serve(
      gist({
        login: "octo cat",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        html_url: "https://evil.example/profile",
      }),
    )
    const result = await fetchGist(ID)
    expect(result.ok && result.gist.owner).toEqual({
      login: "octo cat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/octo%20cat",
    })
    expect(result.ok && result.gist.description).toBe("React hooks")
  })

  test("drops an avatar that isn't served from GitHub's avatar host", async () => {
    serve(gist({ login: "octocat", avatar_url: "https://example.com/me.png" }))
    const result = await fetchGist(ID)
    expect(result.ok && result.gist.owner?.avatarUrl).toBeNull()
  })

  test("copes with an anonymous gist", async () => {
    serve(gist(null))
    const result = await fetchGist(ID)
    expect(result.ok && result.gist.owner).toBeNull()
  })
})

describe("readGistFiles", () => {
  const RAW = "https://gist.githubusercontent.com/octocat/aa11bb22cc33dd44ee55/raw/log.txt"

  async function load(files: Record<string, unknown>, raw: Record<string, string> = {}) {
    serve({ description: null, owner: null, files }, raw)
    const result = await fetchGist(ID)
    if (!result.ok) throw new Error(result.error)
    return result.gist
  }

  test("returns the chosen files in the order asked, once each", async () => {
    const gist = await load({
      "a.ts": { filename: "a.ts", content: "a" },
      "b.ts": { filename: "b.ts", content: "b" },
    })
    const result = await readGistFiles(gist, ["b.ts", "a.ts", "b.ts"])
    expect(result).toEqual({
      ok: true,
      files: [
        { name: "b.ts", content: "b" },
        { name: "a.ts", content: "a" },
      ],
    })
  })

  test("fetches a truncated file's full text from its raw URL", async () => {
    process.env.MAX_PASTE_SIZE = "2MB"
    const full = "line\n".repeat(300 * 1024)
    const gist = await load(
      {
        "log.txt": {
          filename: "log.txt",
          size: full.length,
          raw_url: RAW,
          content: "line",
          truncated: true,
        },
      },
      { [RAW]: full },
    )
    const result = await readGistFiles(gist, ["log.txt"])
    expect(result).toEqual({ ok: true, files: [{ name: "log.txt", content: full }] })
  })

  test("says when a file is gone or can't be imported", async () => {
    const gist = await load({ "a.ts": { filename: "a.ts", content: "a" } })
    expect((await readGistFiles(gist, ["nope.ts"])).ok).toBe(false)

    process.env.MAX_PASTE_SIZE = "1KB"
    const big = await load({ "big.txt": { filename: "big.txt", content: "x".repeat(2048) } })
    expect(await readGistFiles(big, ["big.txt"])).toEqual({
      ok: false,
      error: "big.txt: Over the 1 KB limit.",
    })
  })

  test("cancels an oversized raw stream before reading its remaining chunks", async () => {
    process.env.MAX_PASTE_SIZE = "1KB"
    const gist = await load({
      "log.txt": { filename: "log.txt", size: 1, raw_url: RAW, truncated: true },
    })
    let pulled = 0
    let cancelled = false
    globalThis.fetch = mock(
      async () =>
        new Response(
          new ReadableStream(
            {
              pull(controller) {
                if (pulled === 8) return controller.close()
                pulled++
                controller.enqueue(new Uint8Array(512).fill(65))
              },
              cancel() {
                cancelled = true
              },
            },
            { highWaterMark: 0 },
          ),
          { headers: { "content-length": "1" } },
        ),
    ) as unknown as typeof fetch
    expect(await readGistFiles(gist, ["log.txt"])).toEqual({
      ok: false,
      error: "log.txt couldn't be read from GitHub.",
    })
    expect(cancelled).toBe(true)
    expect(pulled).toBe(3)
  })

  test("preserves UTF-8 characters split across raw chunks", async () => {
    const gist = await load({
      "log.txt": { filename: "log.txt", size: 8, raw_url: RAW, truncated: true },
    })
    const bytes = new TextEncoder().encode("A😀éB")
    globalThis.fetch = mock(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
              controller.close()
            },
          }),
        ),
    ) as unknown as typeof fetch
    expect(await readGistFiles(gist, ["log.txt"])).toEqual({
      ok: true,
      files: [{ name: "log.txt", content: "A😀éB" }],
    })
  })

  test("charges inline contents before raw downloads and cancels at the aggregate limit", async () => {
    process.env.MAX_PASTE_SIZE = "1KB"
    const gist = await load({
      "inline.ts": { filename: "inline.ts", content: "i".repeat(700) },
      "log.txt": { filename: "log.txt", size: 700, raw_url: RAW, truncated: true },
    })
    let cancelled = false
    globalThis.fetch = mock(
      async () =>
        new Response(
          new ReadableStream(
            {
              pull(controller) {
                controller.enqueue(new Uint8Array(200).fill(65))
              },
              cancel() {
                cancelled = true
              },
            },
            { highWaterMark: 0 },
          ),
        ),
    ) as unknown as typeof fetch
    expect(await readGistFiles(gist, ["log.txt", "inline.ts"])).toEqual({
      ok: false,
      error: "Pastes are limited to 1 KB.",
    })
    expect(cancelled).toBe(true)
  })

  test("bounds simultaneous raw downloads while preserving selection order", async () => {
    const gist = await load(
      Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          `${i}.txt`,
          { filename: `${i}.txt`, size: 1, raw_url: `${RAW}?${i}`, truncated: true },
        ]),
      ),
    )
    let release = () => {}
    let started = () => {}
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      calls.push(String(url))
      if (calls.length === 2) started()
      await gate
      return new Response("x")
    }) as unknown as typeof fetch
    const result = readGistFiles(gist, ["3.txt", "2.txt", "1.txt", "0.txt"])
    await ready
    expect(calls).toHaveLength(2)
    release()
    expect(await result).toEqual({
      ok: true,
      files: ["3.txt", "2.txt", "1.txt", "0.txt"].map((name) => ({ name, content: "x" })),
    })
  })
})

describe("gistTitle", () => {
  test("prefers the description, then the first file, within the title limit", async () => {
    serve({
      description: "d".repeat(500),
      owner: null,
      files: { "a.ts": { filename: "a.ts", content: "a" } },
    })
    const described = await fetchGist(ID)
    expect(described.ok && gistTitle(described.gist, "a.ts")).toHaveLength(120)

    serve({ description: null, owner: null, files: { "a.ts": { filename: "a.ts", content: "a" } } })
    const bare = await fetchGist(ID)
    expect(bare.ok && gistTitle(bare.gist, "a.ts")).toBe("a.ts")
    expect(bare.ok && gistTitle(bare.gist)).toBe("Imported gist")
  })
})
