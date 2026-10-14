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

  test("preserves complete graphemes in multilingual and emoji names", () => {
    expect(initials("Jo")).toBe("JO")
    expect(initials("王秀英")).toBe("王秀")
    expect(initials("Đặng Thị Ngọc Hân")).toBe("ĐH")
    expect(initials("🦊 Fox")).toBe("🦊F")
    expect(initials("👩🏽‍💻 Priya")).toBe("👩🏽‍💻P")
    expect(initials("A\u0301da Lee")).toBe("A\u0301L")
    expect(initials("👩🏽‍💻")).toBe("👩🏽‍💻")
  })

  test("uses the family name before a generational suffix", () => {
    expect(initials("Christopher Alexander Montgomery III")).toBe("CM")
    expect(initials("Sam Lee Jr.")).toBe("SL")
    expect(initials("  Sam   Lee ")).toBe("SL")
  })
})
