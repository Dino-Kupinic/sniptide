// Data behind the Analytics page. There is no analytics backend yet (paste_view_day only counts
// views per day), so this builds typed mock data from the Paper design's numbers. `getAnalytics`
// is the one seam: swap its body for real queries and keep the `AnalyticsReport` shape, and the page
// and its CSV export need no changes.

import { DAY, HOUR } from "@/lib/time"

export const ANALYTICS_RANGES = ["24h", "7d", "30d", "90d"] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]
export const DEFAULT_RANGE: AnalyticsRange = "30d"

export const METRICS = [
  { id: "views", label: "Views" },
  { id: "unique", label: "Unique visitors" },
  { id: "copies", label: "Code copies" },
  { id: "raw", label: "Raw & API hits" },
] as const
export type MetricId = (typeof METRICS)[number]["id"]

export interface AnalyticsQuery {
  range: AnalyticsRange
  // A paste slug, or undefined for all pastes.
  paste?: string
}

export interface Kpi {
  id: MetricId
  label: string
  value: number
  // Percent change against the previous period of the same length.
  delta: number
}

export interface SeriesPoint {
  // ISO date (daily) or date and hour (hourly), for the CSV export.
  date: string
  // Axis label: "Oct 8", or "14:00" in the 24h range.
  label: string
  values: Record<MetricId, number>
}

export interface TopPaste {
  slug: string
  title: string
  language: string
  views: number
  unique: number
}

export interface Referrer {
  id: string
  label: string
  // Favicon source; null for direct visits and the "other" bucket.
  domain: string | null
  kind: "direct" | "site" | "other"
  views: number
}

export interface CountryRow {
  // ISO 3166-1 alpha-2, lowercase, as the flag icons name their files.
  code: string
  name: string
  views: number
}

export interface DeviceRow {
  id: "desktop" | "mobile" | "cli"
  label: string
  views: number
}

export interface LanguageRow {
  // Language id from lib/pastes/languages.
  language: string
  views: number
}

export interface AnalyticsReport {
  range: AnalyticsRange
  // All pastes the figures cover when nothing is selected.
  pasteCount: number
  // The paste the figures are limited to, if any.
  scope: { slug: string; title: string } | null
  pasteOptions: { slug: string; title: string }[]
  // "Sep 12 – Oct 11"
  rangeLabel: string
  kpis: Kpi[]
  points: SeriesPoint[]
  topPastes: TopPaste[]
  referrers: Referrer[]
  countries: CountryRow[]
  devices: DeviceRow[]
  languages: LanguageRow[]
}

export function parseRange(value: string | undefined): AnalyticsRange {
  return ANALYTICS_RANGES.find((range) => range === value) ?? DEFAULT_RANGE
}

const PASTE_COUNT = 248
const BASE_VIEWS = 13_372

const POINT_COUNT: Record<AnalyticsRange, number> = { "24h": 24, "7d": 7, "30d": 30, "90d": 90 }

const TOTALS: Record<AnalyticsRange, Record<MetricId, number>> = {
  "24h": { views: 512, unique: 341, copies: 96, raw: 38 },
  "7d": { views: 3_086, unique: 1_952, copies: 611, raw: 247 },
  "30d": { views: BASE_VIEWS, unique: 7_904, copies: 2_611, raw: 1_036 },
  "90d": { views: 38_940, unique: 21_866, copies: 7_204, raw: 2_981 },
}

const DELTAS: Record<AnalyticsRange, Record<MetricId, number>> = {
  "24h": { views: 4.2, unique: 3.1, copies: -1.8, raw: 12.4 },
  "7d": { views: 8.6, unique: 6.3, copies: 2.2, raw: 18.9 },
  "30d": { views: 22.1, unique: 15.7, copies: 9.4, raw: 31.0 },
  "90d": { views: 37.5, unique: 29.8, copies: 21.3, raw: 54.2 },
}

// Daily views over the last 30 days, the bars of the Paper chart (the peak is 812).
const VIEWS_30D = [
  242, 300, 421, 479, 450, 521, 408, 229, 279, 442, 500, 471, 558, 429, 242, 308, 458, 521, 492,
  608, 479, 271, 350, 500, 658, 379, 812, 583, 254, 728,
]

const TOP_PASTES: TopPaste[] = [
  {
    slug: "9fLm3a",
    title: "nginx reverse proxy",
    language: "nginx",
    views: 2_412,
    unique: 1_396,
  },
  { slug: "Bq5nT2", title: "Caddyfile", language: "text", views: 1_640, unique: 1_015 },
  { slug: "Lm0aZ8", title: "pg-backup.sh", language: "shell", views: 1_215, unique: 702 },
  {
    slug: "k7Qe2x",
    title: "useDebounce hook",
    language: "typescript",
    views: 1_004,
    unique: 611,
  },
  { slug: "c2Vw9d", title: "retry.ts", language: "typescript", views: 940, unique: 566 },
]

const REFERRERS: Referrer[] = [
  { id: "direct", label: "Direct or copied link", domain: null, kind: "direct", views: 5_082 },
  { id: "github", label: "github.com", domain: "github.com", kind: "site", views: 3_209 },
  {
    id: "hn",
    label: "news.ycombinator.com",
    domain: "news.ycombinator.com",
    kind: "site",
    views: 1_872,
  },
  { id: "slack", label: "slack.com", domain: "slack.com", kind: "site", views: 1_337 },
  { id: "x", label: "x.com", domain: "x.com", kind: "site", views: 802 },
  { id: "other", label: "Other (31 sources)", domain: null, kind: "other", views: 1_070 },
]

const COUNTRIES: CountryRow[] = [
  { code: "at", name: "Austria", views: 3_477 },
  { code: "de", name: "Germany", views: 3_209 },
  { code: "us", name: "United States", views: 2_942 },
  { code: "gb", name: "United Kingdom", views: 1_203 },
  { code: "fr", name: "France", views: 802 },
  { code: "nl", name: "Netherlands", views: 534 },
  { code: "ch", name: "Switzerland", views: 401 },
  { code: "pl", name: "Poland", views: 268 },
  { code: "it", name: "Italy", views: 241 },
]

const DEVICES: DeviceRow[] = [
  { id: "desktop", label: "Desktop", views: 8_291 },
  { id: "mobile", label: "Mobile", views: 4_145 },
  { id: "cli", label: "CLI and API", views: 936 },
]

const LANGUAGES: LanguageRow[] = [
  { language: "typescript", views: 4_145 },
  { language: "nginx", views: 2_407 },
  { language: "shell", views: 1_872 },
  { language: "yaml", views: 1_605 },
  { language: "text", views: 1_471 },
  { language: "python", views: 669 },
  { language: "json", views: 535 },
  { language: "docker", views: 401 },
  { language: "sql", views: 267 },
]

// Small seeded generator, so a range always draws the same shape.
function random(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Splits `total` across `weights` in whole numbers that add up to `total`.
export function apportion(total: number, weights: number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  if (sum === 0) return weights.map(() => 0)

  const exact = weights.map((weight) => (weight / sum) * total)
  const result = exact.map(Math.floor)
  let left = total - result.reduce((acc, value) => acc + value, 0)
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)
  for (const { index } of byRemainder) {
    if (left <= 0) break
    result[index] = (result[index] ?? 0) + 1
    left -= 1
  }
  return result
}

function weightsFor(range: AnalyticsRange, firstDay: number, jitter: () => number) {
  return Array.from({ length: POINT_COUNT[range] }, (_, index) => {
    if (range === "24h") {
      // One daytime hump, with a quiet night.
      const hour = (new Date(firstDay + index * HOUR).getUTCHours() + 24) % 24
      return (
        (0.3 + 0.7 * Math.max(0, Math.sin(((hour - 6) / 18) * Math.PI))) * (0.8 + 0.4 * jitter())
      )
    }
    const day = new Date(firstDay + index * DAY).getUTCDay()
    const weekend = day === 0 || day === 6 ? 0.55 : 1
    const growth = range === "90d" ? 0.7 + (0.4 * index) / 90 : 1
    return weekend * growth * (0.65 + 0.7 * jitter())
  })
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

function buildPoints(range: AnalyticsRange, now: number): SeriesPoint[] {
  const count = POINT_COUNT[range]
  const hourly = range === "24h"
  const step = hourly ? HOUR : DAY
  const last = Math.floor(now / step) * step
  const first = last - (count - 1) * step

  const metrics = METRICS.map((metric, metricIndex) => {
    const total = TOTALS[range][metric.id]
    if (range === "30d" && metric.id === "views") return VIEWS_30D
    const base =
      range === "30d" ? VIEWS_30D : weightsFor(range, first, random(31 * metricIndex + 7))
    // The other metrics follow the views curve, bent a little so they don't mirror it.
    const jitter = random(97 * metricIndex + count)
    return apportion(
      total,
      base.map((weight) => weight * (0.8 + 0.4 * jitter())),
    )
  })

  return Array.from({ length: count }, (_, index) => {
    const time = first + index * step
    const iso = new Date(time).toISOString()
    return {
      date: hourly ? `${iso.slice(0, 13).replace("T", " ")}:00` : iso.slice(0, 10),
      label: hourly ? `${iso.slice(11, 13)}:00` : dayFormat.format(time),
      values: {
        views: metrics[0]?.[index] ?? 0,
        unique: metrics[1]?.[index] ?? 0,
        copies: metrics[2]?.[index] ?? 0,
        raw: metrics[3]?.[index] ?? 0,
      },
    }
  })
}

function scaled<T extends { views: number }>(rows: T[], factor: number) {
  return rows.map((row) => ({ ...row, views: Math.round(row.views * factor) }))
}

export async function getAnalyticsReport(
  { range, paste }: AnalyticsQuery,
  now = Date.now(),
): Promise<AnalyticsReport> {
  const totals = TOTALS[range]
  const factor = totals.views / BASE_VIEWS
  const points = buildPoints(range, now)
  const first = points[0]
  const last = points.at(-1)

  const pasteOptions = TOP_PASTES.map(({ slug, title }) => ({ slug, title }))
  const selected = TOP_PASTES.find((row) => row.slug === paste)
  // Limiting to one paste scales every figure to its share of all views.
  const share = selected ? selected.views / BASE_VIEWS : 1
  const scale = factor * share

  return {
    range,
    pasteCount: PASTE_COUNT,
    scope: selected ? { slug: selected.slug, title: selected.title } : null,
    pasteOptions,
    rangeLabel: `${first?.label ?? ""} – ${last?.label ?? ""}`,
    kpis: METRICS.map((metric) => ({
      id: metric.id,
      label: metric.label,
      value: Math.round(totals[metric.id] * share),
      delta: DELTAS[range][metric.id],
    })),
    points: points.map((point) => ({
      ...point,
      values: {
        views: Math.round(point.values.views * share),
        unique: Math.round(point.values.unique * share),
        copies: Math.round(point.values.copies * share),
        raw: Math.round(point.values.raw * share),
      },
    })),
    topPastes: (selected ? [selected] : TOP_PASTES).map((row) => ({
      ...row,
      views: Math.round((selected ? BASE_VIEWS * share : row.views) * factor),
      unique: Math.round(row.unique * factor),
    })),
    referrers: scaled(REFERRERS, scale),
    countries: scaled(COUNTRIES, scale),
    devices: scaled(DEVICES, scale),
    languages: scaled(LANGUAGES, scale),
  }
}
