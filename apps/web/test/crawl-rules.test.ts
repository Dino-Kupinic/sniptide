import { afterEach, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import robots from "@/app/robots"
import { previewMetadata } from "@/lib/pastes/preview"
import { proxy } from "@/proxy"

const demoMode = process.env.DEMO_MODE
const edition = process.env.SNIPTIDE_EDITION
afterEach(() => {
  if (demoMode === undefined) delete process.env.DEMO_MODE
  else process.env.DEMO_MODE = demoMode
  if (edition === undefined) delete process.env.SNIPTIDE_EDITION
  else process.env.SNIPTIDE_EDITION = edition
})

const robotsTag = (path: string) =>
  proxy(new NextRequest(`https://demo.sniptide.com${path}`)).headers.get("x-robots-tag")

test("robots.txt keeps the API out and leaves /_next crawlable", () => {
  process.env.SNIPTIDE_EDITION = "cloud"
  const rules = robots().rules
  expect(rules).toEqual({ userAgent: "*", allow: "/", disallow: "/api/" })
})

test("self-hosted responses ask crawlers to exclude pages and raw shares", () => {
  delete process.env.SNIPTIDE_EDITION
  expect(robots().rules).toEqual({ userAgent: "*", disallow: ["/api/", "/_next/"] })
  for (const path of ["/", "/k7Qe2x", "/k7Qe2x/raw", "/@dino"])
    expect(robotsTag(path)).toBe("noindex, nofollow, noarchive")
})

test("a demo instance tells search engines not to index any page", () => {
  process.env.SNIPTIDE_EDITION = "cloud"
  process.env.DEMO_MODE = "true"
  for (const path of ["/", "/k7Qe2x", "/dashboard", "/@dino"])
    expect(robotsTag(path)).toBe("noindex, nofollow")
  process.env.DEMO_MODE = "false"
  expect(robotsTag("/k7Qe2x")).toBeNull()
  delete process.env.DEMO_MODE
  expect(robotsTag("/")).toBeNull()
})

test("public pastes point search engines at their share link, unlisted ones stay out", () => {
  process.env.SNIPTIDE_EDITION = "cloud"
  const preview = {
    slug: "k7Qe2x",
    title: "Example",
    name: "index.ts",
    language: "typescript",
    content: "export {}",
  }
  const listed = previewMetadata(preview, "https://sniptide.com")
  expect(listed.alternates).toEqual({ canonical: "https://sniptide.com/k7Qe2x" })
  expect(listed).not.toHaveProperty("robots")
  const unlisted = previewMetadata({ ...preview, unlisted: true }, "https://sniptide.com")
  expect(unlisted).not.toHaveProperty("alternates")
  expect(unlisted.robots).toEqual({ index: false, follow: false })

  process.env.SNIPTIDE_EDITION = "selfhost"
  const selfhost = previewMetadata(preview, "https://paste.example")
  expect(selfhost).not.toHaveProperty("alternates")
  expect(selfhost.robots).toEqual({ index: false, follow: false })
  expect(selfhost.openGraph?.url).toBe("https://paste.example/k7Qe2x")
})
