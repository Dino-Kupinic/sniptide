import { expect, spyOn, test } from "bun:test"
import { Glob } from "bun"
import path from "node:path"
import { isSlugAvailable, randomSlug } from "@/lib/pastes/store"

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
  const random = spyOn(crypto, "getRandomValues")
    .mockReturnValueOnce(Uint8Array.from([41, 31, 24, 40, 28, 27]))
    .mockReturnValueOnce(Uint8Array.from([38, 24, 41, 42, 28, 41]))
    .mockReturnValueOnce(Uint8Array.from([16, 7, 0, 15, 4, 3]))
    .mockReturnValueOnce(Uint8Array.from([34, 54, 14, 28, 49, 46]))

  try {
    expect(randomSlug()).toBe("k7Qe2x")
  } finally {
    random.mockRestore()
  }
})
