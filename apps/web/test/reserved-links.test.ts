import { describe, expect, test } from "bun:test"
import { isSlugAvailable } from "@/lib/pastes/store"

// These names are pages or image routes of the app or of the marketing site, so a paste can't use
// one as its link: the page would answer instead of the paste.
const reserved = [
  "dashboard",
  "settings",
  "docs",
  "home",
  "privacy",
  "terms",
  "impressum",
  "opengraph-image",
  "twitter-image",
]

describe("reserved links", () => {
  for (const name of reserved) {
    test(`${name} can't be used as a custom link`, async () => {
      expect(await isSlugAvailable(name)).toBe(false)
      expect(await isSlugAvailable(name.toUpperCase())).toBe(false)
    })
  }
})
