import { expect, spyOn, test } from "bun:test"
import { randomSlug } from "@/lib/pastes/links"
import { isSlugAvailable } from "@/lib/pastes/store"

test("new paste links have eight readable random characters", () => {
  expect(randomSlug()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{8}$/)
})

test("existing paste links are checked by format without reserving route words", async () => {
  for (const slug of ["pastes", "PASTES", "settings", "about", "_next", "Ab3xY9", "a".repeat(40)]) {
    expect(await isSlugAvailable(slug, slug)).toBe(true)
  }
  for (const slug of ["ab", "with spaces", "with/slashes", "a".repeat(41)]) {
    expect(await isSlugAvailable(slug, slug)).toBe(false)
  }
})

test("generated paste links do not filter route words", () => {
  const random = spyOn(crypto, "getRandomValues").mockImplementation((array: unknown) => {
    if (!(array instanceof Uint8Array)) throw new TypeError("Expected a Uint8Array")
    array.set([38, 24, 41, 42, 28, 41, 0, 1])
    return array
  })

  try {
    expect(randomSlug()).toBe("pastesAB")
    expect(random).toHaveBeenCalledTimes(1)
  } finally {
    random.mockRestore()
  }
})

test("generation discards biased bytes and refills until the link is complete", () => {
  const random = spyOn(crypto, "getRandomValues")
    .mockImplementationOnce((array: unknown) => {
      if (!(array instanceof Uint8Array)) throw new TypeError("Expected a Uint8Array")
      array.fill(255)
      array.set([228, 229, 255, 0, 56])
      return array
    })
    .mockImplementation((array: unknown) => {
      if (!(array instanceof Uint8Array)) throw new TypeError("Expected a Uint8Array")
      return array.fill(1)
    })
  try {
    expect(randomSlug()).toBe("A9BBBBBB")
    expect(random).toHaveBeenCalledTimes(2)
  } finally {
    random.mockRestore()
  }
})
