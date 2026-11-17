import { describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import path from "node:path"

// The router prefetches a dynamic route only down to its first loading boundary and shows that
// boundary on click. A `loading.tsx` that also wraps a deeper route would flash its own screen's
// skeleton before the deeper route's skeleton replaces it, as the collections list did before a
// collection. So a segment's loading state sits in a route group beside its page, where it
// wraps that page alone.

const appDir = path.join(import.meta.dir, "..", "app")

function hasPageBelow(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((entry) => {
    if (!entry.isDirectory()) return false
    const child = path.join(dir, entry.name)
    return readdirSync(child).some((name) => /^page\.tsx?$/.test(name)) || hasPageBelow(child)
  })
}

function loadingFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return loadingFiles(full)
    return entry.name === "loading.tsx" ? [full] : []
  })
}

describe("loading boundaries", () => {
  // The signed-in layout's own boundary is the fallback for a route that has none.
  const fallback = path.join(appDir, "(app)", "loading.tsx")

  test("each loading state wraps only its own screen", () => {
    const shared = loadingFiles(path.join(appDir, "(app)"))
      .filter((file) => file !== fallback && hasPageBelow(path.dirname(file)))
      .map((file) => path.relative(appDir, file))
    expect(shared).toEqual([])
  })
})
