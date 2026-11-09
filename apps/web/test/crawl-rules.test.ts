import { afterEach, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import robots from "@/app/robots"
import { previewMetadata } from "@/lib/pastes/preview"
import { proxy } from "@/proxy"

const demoMode = process.env.DEMO_MODE
afterEach(() => {
  if (demoMode === undefined) delete process.env.DEMO_MODE
  else process.env.DEMO_MODE = demoMode
})

const robotsTag = (path: string) =>
  proxy(new NextRequest(`https://demo.sniptide.com${path}`)).headers.get("x-robots-tag")

test("robots.txt keeps the API and /cdn-cgi out and leaves /_next crawlable", () => {
  const rules = robots().rules
  expect(rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/api/", "/cdn-cgi/"] })
})

test("a demo instance tells search engines not to index any page", () => {
  process.env.DEMO_MODE = "true"
  for (const path of ["/", "/k7Qe2x", "/dashboard", "/@dino"])
    expect(robotsTag(path)).toBe("noindex, nofollow")
  process.env.DEMO_MODE = "false"
  expect(robotsTag("/k7Qe2x")).toBeNull()
  delete process.env.DEMO_MODE
  expect(robotsTag("/")).toBeNull()
})

test("public pastes point search engines at their share link, unlisted ones stay out", () => {
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
})
