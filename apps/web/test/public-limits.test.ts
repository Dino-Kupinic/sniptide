import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { POST as copy } from "@/app/[slug]/copy/route"
import { GET as preview } from "@/app/[slug]/preview/route"
import { GET as raw } from "@/app/[slug]/raw/route"
import { POST as reveal } from "@/app/[slug]/reveal/route"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser } from "./harness"

// The public routes that need no account count requests per visitor, so one address can't flood
// the database with reads and event writes. The caps are far above what a person does.

const describeDb = hasDatabase ? describe : describe.skip

const env = { ...process.env }
const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never

// A request from `address`, as Cloudflare would name it.
const from = (address: string | null, method = "GET") =>
  new Request("http://x/slug", {
    method,
    headers: address ? { "cf-connecting-ip": address } : {},
  })

// The status of each of `count` requests in a row.
async function statuses(count: number, send: () => Promise<Response>) {
  const result: number[] = []
  for (let request = 0; request < count; request++) result.push((await send()).status)
  return result
}

describeDb("public route limits", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    process.env.CLIENT_IP_SOURCE = "cloudflare"
    await resetDatabase()
    await seedUser("owner")
    await seedPaste({ slug: "open", owner: "owner", visibility: "public" })
  })
  afterEach(() => {
    process.env = { ...env }
  })

  test("raw files answer 429 with Retry-After once a visitor passes 120 a minute", async () => {
    const send = () => raw(from("198.51.100.1"), params("open"))
    const first = await statuses(120, send)
    expect(first.every((status) => status === 200)).toBe(true)

    const refused = await send()
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(refused.headers.get("cache-control")).toBe("private, no-store")
  })

  test("another visitor isn't held back by it", async () => {
    for (let request = 0; request < 121; request++) await raw(from("198.51.100.1"), params("open"))

    expect((await raw(from("198.51.100.1"), params("open"))).status).toBe(429)
    expect((await raw(from("198.51.100.2"), params("open"))).status).toBe(200)
  })

  test("each route keeps its own count", async () => {
    for (let request = 0; request < 121; request++) await raw(from("198.51.100.1"), params("open"))

    expect((await copy(from("198.51.100.1", "POST"), params("open"))).status).toBe(204)
  })

  test("the copy beacon stops counting after 30 a minute", async () => {
    const send = () => copy(from("198.51.100.3", "POST"), params("open"))
    expect((await statuses(30, send)).every((status) => status === 204)).toBe(true)
    expect((await send()).status).toBe(429)
  })

  test("link-preview images are limited to 60 a minute", async () => {
    const send = () => preview(from("198.51.100.4"), params("missing"))
    expect((await statuses(60, send)).every((status) => status === 404)).toBe(true)
    expect((await send()).status).toBe(429)
  })

  test("a refused reveal never burns the paste", async () => {
    await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true, allowRaw: false })
    // Use up the allowance on a paste that doesn't exist.
    for (let request = 0; request < 30; request++) {
      await reveal(from("198.51.100.5", "POST"), params("nothing"))
    }

    const refused = await reveal(from("198.51.100.5", "POST"), params("burn"))
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ ok: false })
    expect((await pasteRow("burn"))?.deletedAt).toBeNull()

    expect((await reveal(from("198.51.100.6", "POST"), params("burn"))).status).toBe(200)
  })

  test("a request whose address can't be told is let through", async () => {
    process.env.CLIENT_IP_SOURCE = "direct"
    const statusesSeen = await statuses(130, () => raw(from(null), params("open")))
    expect(statusesSeen.every((status) => status === 200)).toBe(true)
  })
})
