import { expect, spyOn, test } from "bun:test"
import path from "node:path"
import { Glob } from "bun"
import { randomSlug } from "@/lib/pastes/links"
import { isSlugAvailable } from "@/lib/pastes/store"

const appRoutes = new Set(
  Array.from(
    new Glob("**/{page,route}.{ts,tsx}").scanSync(path.join(import.meta.dir, "../app")),
  ).flatMap((file) => {
    const slug = file.split("/").find((segment) => !segment.startsWith("("))
    return slug && !slug.startsWith("[") && !slug.includes(".") ? [slug] : []
  }),
)

test("custom paste links cannot claim app routes, even when editing an existing slug", async () => {
  expect(appRoutes.size).toBeGreaterThan(10)
  for (const slug of appRoutes) {
    expect(await isSlugAvailable(slug, slug), slug).toBe(false)
    expect(await isSlugAvailable(slug.toUpperCase(), slug.toUpperCase()), slug).toBe(false)
  }
})

test("generated paste links skip app routes regardless of case", () => {
  const candidates = [
    [41, 31, 24, 40, 28, 27],
    [38, 24, 41, 42, 28, 41],
    [16, 7, 0, 15, 4, 3],
    [34, 54, 14, 28, 49, 46],
  ]
  const random = spyOn(crypto, "getRandomValues").mockImplementation((array: unknown) => {
    if (!(array instanceof Uint8Array)) throw new TypeError("Expected a Uint8Array")
    const bytes = candidates.shift()
    if (!bytes) throw new Error("Generated no usable paste link")
    array.set(bytes)
    return array
  })

  try {
    expect(randomSlug()).toBe("k7Qe2x")
  } finally {
    random.mockRestore()
  }
})

test("custom paste links reserve marketing routes on the share host", async () => {
  for (const slug of [
    "about",
    "ask",
    "contact",
    "home",
    "impressum",
    "privacy",
    "skills",
    "terms",
  ]) {
    expect(await isSlugAvailable(slug, slug)).toBe(false)
    expect(await isSlugAvailable(slug.toUpperCase(), slug.toUpperCase())).toBe(false)
  }
})
