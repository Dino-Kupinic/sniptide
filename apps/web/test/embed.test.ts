import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { embedCode, embedHeight } from "@/lib/pastes/embed"
import { readEmbedPaste } from "@/lib/pastes/store"
import nextConfig from "@/next.config"
import {
  hasDatabase,
  pasteRow,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  unlock,
} from "./harness"

describe("embed code", () => {
  test("fits the first file up to twenty lines and escapes the title", () => {
    expect(embedHeight(1, 1)).toBe(78 + 22)
    expect(embedHeight(500, 1)).toBe(78 + 20 * 22)
    expect(embedHeight(3, 2)).toBe(78 + 44 + 3 * 22)
    const code = embedCode("https://sniptide.com/k7Qe2x", 'say "hi" <b> & go', 3, 1)
    expect(code).toContain('src="https://sniptide.com/k7Qe2x/embed"')
    expect(code).toContain('title="say &quot;hi&quot; &lt;b> &amp; go"')
    expect(code).toContain('height="144"')
  })
})

describe("frame headers", () => {
  // Resolves the headers Next would send for a path, the last matching entry winning per key.
  async function headersFor(path: string) {
    const { getPathMatch } = await import("next/dist/shared/lib/router/utils/path-match" as string)
    const result = new Map<string, string>()
    for (const entry of (await nextConfig.headers?.()) ?? []) {
      if (!getPathMatch(entry.source)(path)) continue
      for (const header of entry.headers) result.set(header.key, header.value)
    }
    return result
  }

  test("only a paste's embed view may be framed by other sites", async () => {
    const embed = await headersFor("/k7Qe2x/embed")
    expect(embed.get("Content-Security-Policy")).toContain("frame-ancestors *")
    expect(embed.has("X-Frame-Options")).toBe(false)

    for (const path of ["/", "/k7Qe2x", "/k7Qe2x/print", "/pastes/embed", "/collections/embed"]) {
      const headers = await headersFor(path)
      expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'")
      expect(headers.get("X-Frame-Options")).toBe("DENY")
    }
  })
})

const describeDb = hasDatabase ? describe : describe.skip

describeDb("embed access", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs(null)
  })

  test("serves public and unlisted pastes without counting a view", async () => {
    await seedPaste({ slug: "open", owner: "owner", visibility: "public", content: "one" })
    await seedPaste({ slug: "link", owner: "owner", visibility: "unlisted", content: "two" })
    expect((await readEmbedPaste("open"))?.files[0]?.content).toBe("one")
    expect((await readEmbedPaste("link"))?.files[0]?.content).toBe("two")
    expect((await pasteRow("open"))?.views).toBe(0)
  })

  test("never serves a restricted paste, even to its owner or an unlocked visitor", async () => {
    await seedPaste({ slug: "private", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "password", owner: "owner", visibility: "public", password: "secret" })
    await seedPaste({ slug: "burn", owner: "owner", visibility: "public", burnAfterRead: true })
    await seedPaste({
      slug: "expired",
      owner: "owner",
      visibility: "public",
      expiresAt: new Date(Date.now() - 1000),
    })
    await seedPaste({
      slug: "trashed",
      owner: "owner",
      visibility: "public",
      deletedAt: new Date(),
    })
    for (const viewer of [null, "owner"]) {
      signInAs(viewer)
      await unlock("password")
      for (const slug of ["private", "password", "burn", "expired", "trashed", "missing"]) {
        expect(await readEmbedPaste(slug)).toBeNull()
      }
    }
    expect((await pasteRow("burn"))?.deletedAt).toBeNull()
  })
})
