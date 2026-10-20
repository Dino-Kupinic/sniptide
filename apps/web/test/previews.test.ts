import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { generateMetadata } from "@/app/[slug]/page"
import { GET as image } from "@/app/[slug]/preview/route"
import { previewLines, previewMetadata } from "@/lib/pastes/preview"
import { readPublicPreview } from "@/lib/pastes/store"
import {
  hasDatabase,
  pasteRow,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  unlock,
} from "./harness"

describe("preview cards", () => {
  test("bounds large lines, normalizes newlines and preserves code indentation", () => {
    expect(previewLines("\tfirst\r\n  second\rthird")).toEqual(["  first", "  second", "third"])
    expect(previewLines("x".repeat(1_000_000))).toEqual(["x".repeat(88)])
    expect(previewLines("line\n".repeat(30))).toHaveLength(10)
  })

  test("uses absolute share-domain image URLs for OG and X", () => {
    const meta = previewMetadata(
      {
        slug: "hello",
        title: "Example",
        name: "index.ts",
        language: "typescript",
        content: "export {}",
      },
      "https://sniptide.com",
    )
    expect(meta.openGraph).toMatchObject({
      url: "https://sniptide.com/hello",
      images: [{ url: "https://sniptide.com/hello/preview", width: 1200, height: 630 }],
    })
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" })
    expect(meta.description).toContain("TypeScript")
  })
})

const describeDb = hasDatabase ? describe : describe.skip
const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never

describeDb("public preview access", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs(null)
  })

  test("renders a real uncached PNG without counting a visit", async () => {
    await seedPaste({
      slug: "open",
      owner: "owner",
      visibility: "public",
      language: "typescript",
      content: "const answer = 42\nconsole.log(answer)",
    })
    const response = await image(new Request("http://localhost/open/preview"), params("open"))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("cache-control")).toBe("no-store")
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(16)).toBe(1200)
    expect(view.getUint32(20)).toBe(630)
    expect((await pasteRow("open"))?.views).toBe(0)
    expect(await generateMetadata(params("open"))).toMatchObject({
      twitter: { card: "summary_large_image" },
    })
  })

  test("never exposes restricted content, even to its owner or an unlocked visitor", async () => {
    await seedPaste({ slug: "private", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "unlisted", owner: "owner" })
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
      for (const slug of [
        "private",
        "unlisted",
        "password",
        "burn",
        "expired",
        "trashed",
        "missing",
      ]) {
        expect(await readPublicPreview(slug)).toBeNull()
        const response = await image(new Request(`http://localhost/${slug}/preview`), params(slug))
        expect(response.status).toBe(404)
        expect(response.headers.get("cache-control")).toBe("no-store")
        expect(await response.text()).toBe("")
        expect(await generateMetadata(params(slug))).not.toHaveProperty("openGraph")
      }
    }
    expect((await pasteRow("burn"))?.deletedAt).toBeNull()
    expect((await pasteRow("burn"))?.views).toBe(0)
  })
})
