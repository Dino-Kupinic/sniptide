import { afterEach, describe, expect, test } from "bun:test"
import { absoluteUrl, ogImagePath, siteUrl } from "./site"

const original = process.env.SITE_URL
afterEach(() => {
  if (original === undefined) delete process.env.SITE_URL
  else process.env.SITE_URL = original
})

describe("site URLs", () => {
  test("default to the docs domain", () => {
    delete process.env.SITE_URL
    expect(siteUrl()).toBe("https://docs.sniptide.com")
  })

  test("follow SITE_URL, without a trailing slash", () => {
    process.env.SITE_URL = " https://docs.example.com/ "
    expect(siteUrl()).toBe("https://docs.example.com")
    expect(absoluteUrl("/self-hosting/backups")).toBe(
      "https://docs.example.com/self-hosting/backups",
    )
  })

  test("the home page has no trailing slash, matching its canonical link", () => {
    delete process.env.SITE_URL
    expect(absoluteUrl("/")).toBe("https://docs.sniptide.com")
  })

  test("every page has an image path, the home page included", () => {
    expect(ogImagePath([])).toBe("/og/image.png")
    expect(ogImagePath(["core-concepts", "pastes"])).toBe("/og/core-concepts/pastes/image.png")
  })
})
