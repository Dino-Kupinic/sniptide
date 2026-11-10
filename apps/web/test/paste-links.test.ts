import { expect, spyOn, test } from "bun:test"
import {
  customLink,
  customLinkName,
  isCustomLink,
  randomSlug,
  routeSegment,
  slugFromRoute,
} from "@/lib/pastes/links"
import { isSlugAvailable } from "@/lib/pastes/store"

test("new paste links have eight readable random characters", () => {
  expect(randomSlug()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{8}$/)
})

test("a paste can always keep its current link, including top-level links", async () => {
  for (const slug of ["pastes", "settings", "Ab3xY9", "@dino/deploy"]) {
    expect(await isSlugAvailable(slug, "dino", slug)).toBe(true)
    expect(await isSlugAvailable(slug, null, slug)).toBe(true)
  }
})

test("new custom links have to be under the owner's handle", async () => {
  for (const slug of [
    "deploy",
    "dino/deploy",
    "@other/deploy",
    "@dino/",
    "@dino/with space",
    "@dino/a/b",
  ]) {
    expect(await isSlugAvailable(slug, "dino")).toBe(false)
  }
  expect(await isSlugAvailable("@dino/deploy", null)).toBe(false)
})

test("any handle holds links with any well-formed name", () => {
  expect(isCustomLink("@dino/deploy-script", "dino")).toBe(true)
  expect(isCustomLink(`@dino/${"a".repeat(40)}`, "dino")).toBe(true)
  expect(isCustomLink("@dino/x", "dino")).toBe(true)
  // The "@" keeps links apart from paste pages and app routes, so these names and handles are fine.
  expect(isCustomLink("@dino/raw", "dino")).toBe(true)
  expect(isCustomLink("@pastes/deploy", "pastes")).toBe(true)
  expect(isCustomLink(`@dino/${"a".repeat(41)}`, "dino")).toBe(false)
  expect(customLink("dino", "deploy")).toBe("@dino/deploy")
  expect(customLinkName("@dino/deploy", "dino")).toBe("deploy")
  expect(customLinkName("dino/deploy", "dino")).toBe("")
})

test("route segments map to slugs and back", () => {
  expect(slugFromRoute("Ab3xY9qr")).toBe("Ab3xY9qr")
  expect(slugFromRoute("dino~deploy")).toBe("@dino/deploy")
  expect(routeSegment("@dino/deploy")).toBe("dino~deploy")
  expect(routeSegment("Ab3xY9qr")).toBe("Ab3xY9qr")
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
