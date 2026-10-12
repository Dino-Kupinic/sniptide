import { describe, expect, test } from "bun:test"
import { formatTick, labelIndexes, niceScale } from "@/components/analytics-page/chart-scale"
import { type AnalyticsReport, METRICS, parseRange } from "@/lib/pastes/analytics"
import { analyticsCsv, analyticsCsvName } from "@/lib/pastes/analytics-csv"

// The pieces of the Analytics page that need no database: the range in the URL, the CSV and the
// chart's axis maths. The figures themselves are in paste-analytics.test.ts.

describe("range", () => {
  test("keeps known ranges and defaults the rest", () => {
    expect(parseRange("7d")).toBe("7d")
    expect(parseRange("24h")).toBe("24h")
    expect(parseRange("nope")).toBe("30d")
    expect(parseRange(undefined)).toBe("30d")
  })
})

describe("csv export", () => {
  const report = {
    range: "7d",
    scope: { type: "paste", slug: "Bq5nT2", title: "Caddyfile" },
    points: [
      { date: "2026-10-05", label: "Oct 5", values: { views: 4, unique: 3, copies: 1, raw: 0 } },
      { date: "2026-10-06", label: "Oct 6", values: { views: 0, unique: 0, copies: 0, raw: 2 } },
    ],
  } as AnalyticsReport

  test("has a header, one row per point and a name that says what it covers", () => {
    expect(analyticsCsv(report)).toBe(
      "date,views,unique_visitors,code_copies,raw_api_hits\n2026-10-05,4,3,1,0\n2026-10-06,0,0,0,2\n",
    )
    expect(analyticsCsvName(report)).toBe("sniptide-analytics-Bq5nT2-7d.csv")
  })

  test("a column for every metric the tiles show", () => {
    expect(METRICS).toHaveLength(4)
    expect(analyticsCsv(report).split("\n")[0]?.split(",")).toHaveLength(METRICS.length + 1)
  })
})

describe("chart axis", () => {
  test("reaches the biggest bar in four even steps", () => {
    expect(niceScale(812)).toEqual({ max: 1000, ticks: [0, 250, 500, 750, 1000] })
    expect(niceScale(146)).toEqual({ max: 200, ticks: [0, 50, 100, 150, 200] })
  })

  test("an empty chart still has an axis", () => {
    expect(niceScale(0).ticks).toEqual([0, 1, 2, 3, 4])
  })

  test("never uses fractional steps", () => {
    for (const max of [1, 2, 3, 5, 9]) {
      for (const tick of niceScale(max).ticks) expect(Number.isInteger(tick)).toBe(true)
    }
  })

  test("formats ticks as 750, 1k, 1.25k", () => {
    expect([formatTick(750), formatTick(1000), formatTick(1250)]).toEqual(["750", "1k", "1.25k"])
  })

  test("labels every week, the peak and the last day without crowding", () => {
    expect([...labelIndexes(30, 26)].sort((a, b) => a - b)).toEqual([0, 7, 14, 21, 26, 29])
  })

  test("drops the last label when it would touch the peak", () => {
    expect(labelIndexes(30, 28).has(29)).toBe(false)
    expect(labelIndexes(30, 28).has(28)).toBe(true)
  })
})
