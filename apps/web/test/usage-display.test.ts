import { describe, expect, it } from "bun:test"
import { usageHistory, usageLimitState } from "../lib/account/usage-display"
import { DAY } from "../lib/time"

describe("usage limits", () => {
  it("uses raw values for thresholds and clamps only the displayed percentage", () => {
    expect(usageLimitState(7999, 10000)).toMatchObject({ kind: "limited", status: "normal" })
    expect(usageLimitState(80, 100)).toEqual({ kind: "limited", percent: 80, status: "warning" })
    expect(usageLimitState(100, 100)).toEqual({ kind: "limited", percent: 100, status: "full" })
    expect(usageLimitState(120, 100)).toEqual({ kind: "limited", percent: 100, status: "full" })
    expect(usageLimitState(0, 0)).toEqual({ kind: "limited", percent: 100, status: "full" })
    expect(usageLimitState(100, null)).toEqual({ kind: "unlimited" })
  })
})

describe("usage history", () => {
  it("aggregates tokens into an inclusive UTC window and fills missing days", () => {
    const today = Math.floor(Date.parse("2026-01-02T23:59:59Z") / DAY)
    expect(
      usageHistory(
        [
          { day: today - 3, requests: 99 },
          { day: today - 2, requests: 2 },
          { day: today, requests: 3 },
          { day: today, requests: 4 },
          { day: today + 1, requests: 99 },
        ],
        today,
        3,
      ),
    ).toEqual({
      days: [
        { date: "2025-12-31", requests: 2 },
        { date: "2026-01-01", requests: 0 },
        { date: "2026-01-02", requests: 7 },
      ],
      total: 9,
    })
    expect(usageHistory([], today, 1)).toEqual({
      days: [{ date: "2026-01-02", requests: 0 }],
      total: 0,
    })
  })
})
