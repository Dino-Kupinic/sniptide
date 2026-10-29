import { describe, expect, test } from "bun:test"
import { formatDateTime, initials } from "@/lib/format"

describe("date and time display", () => {
  test("shows a one-hour expiry across midnight in the viewer's timezone", () => {
    const now = Date.parse("2026-10-29T23:33:00+01:00")
    const expiry = now + 3_600_000
    expect(formatDateTime(expiry, "en", { timeZone: "Europe/Vienna" })).toMatch(/Oct 30.*00:33/)
    expect(formatDateTime(expiry, "en", { timeZoneName: "short" })).toMatch(/Oct 29.*23:33 UTC/)
    expect(
      formatDateTime(expiry, "en", { timeZone: "Europe/Vienna", timeZoneName: "short" }),
    ).toMatch(/Oct 30.*00:33 GMT\+1/)
  })

  test("uses the offset at expiry across daylight saving changes", () => {
    const expiry = Date.parse("2026-10-25T02:33:00+02:00") + 3_600_000
    expect(
      formatDateTime(expiry, "en", { timeZone: "Europe/Vienna", timeZoneName: "short" }),
    ).toMatch(/Oct 25.*02:33 GMT\+1/)
  })

  test("keeps the existing UTC default and supports other locales and offsets", () => {
    const expiry = Date.parse("2026-10-29T23:33:00Z")
    expect(formatDateTime(expiry)).toMatch(/Oct 29.*23:33$/)
    expect(formatDateTime(expiry, "de", { timeZone: "Europe/Vienna" })).toMatch(/30\. Okt\..*00:33/)
    expect(formatDateTime(expiry, "en", { timeZone: "America/New_York" })).toMatch(/Oct 29.*19:33/)
  })
})

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
