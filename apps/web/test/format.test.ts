import { describe, expect, test } from "bun:test"
import { initials } from "@/lib/format"

describe("initials", () => {
  test("takes the first and last word", () => {
    expect(initials("Jane Doe")).toBe("JD")
    expect(initials("Mary Jane Watson")).toBe("MW")
    expect(initials("jane.doe")).toBe("JD")
    expect(initials("  ada_lovelace ")).toBe("AL")
  })

  test("falls back to the first two letters, then a placeholder", () => {
    expect(initials("jane")).toBe("JA")
    expect(initials("x")).toBe("X")
    expect(initials("   ")).toBe("?")
  })
})
