import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { generateMetadata } from "@/app/[slug]/page"
import { GET as image } from "@/app/[slug]/preview/route"
import { GET as video } from "@/app/[slug]/preview.mp4/route"
import { previewLines, previewMetadata } from "@/lib/pastes/preview"
import { lifeCell, lifeCells, lifeGutterWidth, loopLength } from "@/lib/pastes/preview-life"
import { previewVideoAvailable } from "@/lib/pastes/preview-video"
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
    expect(previewLines("line\n".repeat(30))).toHaveLength(12)
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
    expect(meta.openGraph).not.toHaveProperty("videos")
  })

  test("adds the og:video next to the image, with a secure URL only over https", () => {
    const preview = {
      slug: "hello",
      title: "Example",
      name: "index.ts",
      language: "typescript",
      content: "export {}",
    }
    const secure = previewMetadata(preview, "https://sniptide.com", { video: true })
    expect(secure.openGraph).toMatchObject({
      images: [{ url: "https://sniptide.com/hello/preview" }],
      videos: [
        {
          url: "https://sniptide.com/hello/preview.mp4",
          secureUrl: "https://sniptide.com/hello/preview.mp4",
          type: "video/mp4",
          width: 1200,
          height: 630,
        },
      ],
    })
    const plain = previewMetadata(preview, "http://localhost:3000", { video: true })
    const [plainVideo] = (plain.openGraph as { videos: object[] }).videos
    expect(plainVideo).toMatchObject({ url: "http://localhost:3000/hello/preview.mp4" })
    expect(plainVideo).not.toHaveProperty("secureUrl")
  })

  test("loops the Game of Life seamlessly and keeps it in the gutters", () => {
    const key = (time: number) => JSON.stringify(lifeCells(time))
    expect(key(loopLength)).toBe(key(0))
    expect(key(loopLength + 2.5)).toBe(key(2.5))
    for (const time of [0, 17.5, loopLength - 1]) {
      const cells = lifeCells(time)
      expect(cells.length).toBeGreaterThan(50)
      for (const { x, y, trail, live } of cells) {
        expect(x < lifeGutterWidth || x + lifeCell > 1200 - lifeGutterWidth).toBe(true)
        expect(y + lifeCell).toBeLessThanOrEqual(630)
        expect(trail).toBeLessThanOrEqual(1)
        expect(live).toBeLessThanOrEqual(1)
      }
    }
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

  test("previews unlisted pastes but keeps them out of search engines", async () => {
    await seedPaste({ slug: "unlisted", owner: "owner", content: "let hidden = true" })
    expect(await readPublicPreview("unlisted")).toMatchObject({ unlisted: true })
    const response = await image(
      new Request("http://localhost/unlisted/preview"),
      params("unlisted"),
    )
    expect(response.status).toBe(200)
    expect(await generateMetadata(params("unlisted"))).toMatchObject({
      robots: { index: false, follow: false },
      openGraph: { images: [{ url: expect.stringContaining("/unlisted/preview") }] },
    })
    await seedPaste({ slug: "listed", owner: "owner", visibility: "public" })
    expect(await generateMetadata(params("listed"))).not.toHaveProperty("robots")
  })

  test("never exposes restricted content, even to its owner or an unlocked visitor", async () => {
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
        expect(await readPublicPreview(slug)).toBeNull()
        const response = await image(new Request(`http://localhost/${slug}/preview`), params(slug))
        expect(response.status).toBe(404)
        expect(response.headers.get("cache-control")).toBe("no-store")
        expect(await response.text()).toBe("")
        const clip = await video(new Request(`http://localhost/${slug}/preview.mp4`), params(slug))
        expect(clip.status).toBe(404)
        expect(await generateMetadata(params(slug))).not.toHaveProperty("openGraph")
      }
    }
    expect((await pasteRow("burn"))?.deletedAt).toBeNull()
    expect((await pasteRow("burn"))?.views).toBe(0)
  })
})

const describeVideo = hasDatabase && (await previewVideoAvailable()) ? describe : describe.skip

describeVideo("preview video", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs(null)
  })

  test("serves an mp4 of a public paste, with byte ranges", async () => {
    await seedPaste({ slug: "clip", owner: "owner", visibility: "public", content: "let x = 1" })
    expect(await generateMetadata(params("clip"))).toMatchObject({
      openGraph: { videos: [{ type: "video/mp4" }] },
    })
    const full = await video(new Request("http://localhost/clip/preview.mp4"), params("clip"))
    expect(full.status).toBe(200)
    expect(full.headers.get("content-type")).toBe("video/mp4")
    const bytes = new Uint8Array(await full.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(4, 8))).toBe("ftyp")
    expect(Number(full.headers.get("content-length"))).toBe(bytes.length)

    const ranged = await video(
      new Request("http://localhost/clip/preview.mp4", { headers: { range: "bytes=0-99" } }),
      params("clip"),
    )
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get("content-range")).toBe(`bytes 0-99/${bytes.length}`)
    expect((await ranged.arrayBuffer()).byteLength).toBe(100)

    const outside = await video(
      new Request("http://localhost/clip/preview.mp4", {
        headers: { range: `bytes=${bytes.length}-` },
      }),
      params("clip"),
    )
    expect(outside.status).toBe(416)
    expect((await pasteRow("clip"))?.views).toBe(0)
  }, 60_000)
})
