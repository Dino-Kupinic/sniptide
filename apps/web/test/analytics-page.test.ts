import { describe, expect, test } from "bun:test"
import { formatTick, labelIndexes, niceScale } from "@/components/analytics-page/chart-scale"
import {
  ANALYTICS_RANGES,
  apportion,
  getAnalyticsReport,
  METRICS,
  parseRange,
} from "@/lib/pastes/analytics"
import { analyticsCsv, analyticsCsvName } from "@/lib/pastes/analytics-csv"

// The Analytics page runs on mock data until there is a backend. These pin the shape a real
// implementation has to keep: series that add up to the tiles, and the chart's axis maths.

const NOW = Date.UTC(2026, 9, 11, 13, 30)

describe("analytics report", () => {
  test("each range draws one point per bar and sums to its tiles", async () => {
    const counts = { "24h": 24, "7d": 7, "30d": 30, "90d": 90 }
    for (const range of ANALYTICS_RANGES) {
      const report = await getAnalyticsReport({ range }, NOW)
      expect(report.points).toHaveLength(counts[range])
      for (const metric of METRICS) {
        const sum = report.points.reduce((total, point) => total + point.values[metric.id], 0)
        const kpi = report.kpis.find((item) => item.id === metric.id)
        expect(sum).toBe(kpi?.value ?? -1)
      }
    }
  })

  test("the default 30-day view matches the design", async () => {
    const report = await getAnalyticsReport({ range: "30d" }, NOW)
    expect(report.kpis.map((kpi) => kpi.value)).toEqual([13_372, 7_904, 2_611, 1_036])
    expect(report.rangeLabel).toBe("Sep 12 – Oct 11")
    const views = report.points.map((point) => point.values.views)
    expect(Math.max(...views)).toBe(812)
    expect(report.points[views.indexOf(812)]?.label).toBe("Oct 8")
  })

  test("limiting to one paste scales the figures and lists only that paste", async () => {
    const all = await getAnalyticsReport({ range: "30d" }, NOW)
    const one = await getAnalyticsReport({ range: "30d", paste: "9fLm3a" }, NOW)
    expect(one.scope?.title).toBe("nginx reverse proxy")
    expect(one.topPastes).toHaveLength(1)
    expect(one.kpis[0]?.value).toBe(2_412)
    expect(one.kpis[0]?.value).toBeLessThan(all.kpis[0]?.value ?? 0)
  })

  test("an unknown paste falls back to all pastes", async () => {
    const report = await getAnalyticsReport({ range: "7d", paste: "nope" }, NOW)
    expect(report.scope).toBeNull()
  })

  test("parseRange keeps known ranges and defaults the rest", () => {
    expect(parseRange("7d")).toBe("7d")
    expect(parseRange("nope")).toBe("30d")
    expect(parseRange(undefined)).toBe("30d")
  })

  test("apportion splits a total into whole numbers that add up", () => {
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(apportion(7, [0, 0])).toEqual([0, 0])
    const parts = apportion(13_372, [5, 3, 2, 7, 1])
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(13_372)
  })
})

describe("csv export", () => {
  test("has a header, one row per point and a name that says what it covers", async () => {
    const report = await getAnalyticsReport({ range: "7d", paste: "Bq5nT2" }, NOW)
    const lines = analyticsCsv(report).trimEnd().split("\n")
    expect(lines[0]).toBe("date,views,unique_visitors,code_copies,raw_api_hits")
    expect(lines).toHaveLength(8)
    expect(lines[1]).toMatch(/^2026-10-05,\d+,\d+,\d+,\d+$/)
    expect(analyticsCsvName(report)).toBe("sniptide-analytics-Bq5nT2-7d.csv")
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
