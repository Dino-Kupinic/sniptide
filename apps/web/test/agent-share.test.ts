import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { NextRequest } from "next/server"
import { GET as getCatalog, HEAD as headCatalog } from "@/app/.well-known/api-catalog/route"
import { GET } from "@/app/api/agent-share/[...path]/route"
import { getDb } from "@/lib/db"
import { proxy } from "@/proxy"
import { hasDatabase, marker, request, resetDatabase, seedPaste, seedUser } from "./harness"

function context(path: string) {
  return { params: Promise.resolve({ path: path.split("/") }) }
}
const req = new Request("https://app.sniptide.com/missing", {
  headers: { accept: "text/markdown" },
})
const describeDb = hasDatabase ? describe : describe.skip

test("Markdown negotiation rewrites unknown public paths and preserves raw, embed, APIs, and HTML", () => {
  const missing = proxy(new NextRequest(req))
  expect(missing.headers.get("x-middleware-rewrite")).toBe(
    "https://app.sniptide.com/api/agent-share/missing",
  )
  for (const path of [
    "/slug/raw",
    "/slug/embed",
    "/api/v1/pastes",
    "/.well-known/api-catalog",
    "/dashboard",
    "/docs/api",
  ]) {
    expect(
      proxy(
        new NextRequest(`https://app.sniptide.com${path}`, {
          headers: { accept: "text/markdown" },
        }),
      ).headers.has("x-middleware-rewrite"),
    ).toBe(false)
  }
  for (const accept of ["text/html", "text/markdown;q=0", "text/markdown;q=0.0"]) {
    expect(
      proxy(
        new NextRequest("https://app.sniptide.com/missing", { headers: { accept } }),
      ).headers.has("x-middleware-rewrite"),
    ).toBe(false)
  }
})

test("the app catalog links endpoints separately from descriptions and supports HEAD", async () => {
  const response = getCatalog(new Request("https://app.sniptide.com/.well-known/api-catalog"))
  expect(response.headers.get("content-type")).toContain("application/linkset+json")
  const { linkset } = await response.json()
  expect(linkset[0].item.map((item: { href: string }) => new URL(item.href).pathname)).toEqual([
    "/api/v1/me",
    "/api/mcp",
  ])
  expect(linkset[1]["service-desc"][0].href).toEndWith("/api/openapi.json")
  const head = headCatalog(new Request("https://app.sniptide.com/.well-known/api-catalog"))
  expect(head.headers.get("link")).toContain('rel="api-catalog"')
  expect(await head.text()).toBe("")
})

describeDb("share Markdown access", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
  })
  test("missing paths return a real Markdown 404", async () => {
    for (const path of ["missing", "unknown/nested"]) {
      const response = await GET(req, context(path))
      expect(response.status).toBe(404)
      expect(response.headers.get("content-type")).toContain("text/markdown")
      expect(await response.text()).toContain("# Not found")
    }
  })
  test("public content is represented without views, while private and protected content stays guarded", async () => {
    await seedPaste({
      slug: "public",
      owner: "owner",
      visibility: "public",
      content: "const fence = `value`",
    })
    await seedPaste({ slug: "private", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "password", owner: "owner", password: "protected" })
    await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true })
    await seedPaste({ slug: "no-raw", owner: "owner", allowRaw: false })
    expect(await (await GET(req, context("public"))).text()).toContain("const fence")
    expect((await GET(req, context("private"))).status).toBe(404)
    const locked = await GET(req, context("password"))
    expect(locked.status).toBe(200)
    expect(await locked.text()).not.toContain(marker("password"))
    expect(await (await GET(req, context("burn"))).text()).toContain("Burn after read")
    expect(await (await GET(req, context("no-raw"))).text()).not.toContain(marker("no-raw"))
    const [record] = await getDb().select().from(paste).where(eq(paste.slug, "public"))
    expect(record?.views).toBe(0)
    request.viewer = "owner"
    expect((await GET(req, context("private"))).status).toBe(200)
  })
})
