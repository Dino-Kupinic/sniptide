import { expect, spyOn, test } from "bun:test"
import { randomSlug } from "@/lib/pastes/links"
import { isSlugAvailable } from "@/lib/pastes/store"

test("existing paste links are checked by format without reserving route words", async () => {
  for (const slug of ["pastes", "PASTES", "settings", "about", "_next"]) {
    expect(await isSlugAvailable(slug, slug)).toBe(true)
  }
  for (const slug of ["ab", "with spaces", "with/slashes", "a".repeat(41)]) {
    expect(await isSlugAvailable(slug, slug)).toBe(false)
  }
})

test("generated paste links do not filter route words", () => {
  const random = spyOn(crypto, "getRandomValues").mockImplementation((array: unknown) => {
    if (!(array instanceof Uint8Array)) throw new TypeError("Expected a Uint8Array")
    array.set([38, 24, 41, 42, 28, 41])
    return array
  })

  try {
    expect(randomSlug()).toBe("pastes")
    expect(random).toHaveBeenCalledTimes(1)
  } finally {
    random.mockRestore()
  }
})
