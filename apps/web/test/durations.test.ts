import { describe, expect, test } from "bun:test"
import { DAY, HOUR, HOUR_SECONDS, MINUTE } from "@/lib/time"

describe("duration units", () => {
  test("keeps an hour in milliseconds apart from an hour in seconds", () => {
    expect(Number(MINUTE)).toBe(60_000)
    expect(Number(HOUR)).toBe(3_600_000)
    expect(Number(DAY)).toBe(86_400_000)
    expect(Number(HOUR_SECONDS)).toBe(3_600)
    expect(Number(HOUR)).not.toBe(Number(HOUR_SECONDS))
  })
})
