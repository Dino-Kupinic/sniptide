// What the Analytics page shows, and the shape of GET /api/stats. The figures come from
// analytics-report.ts; this file only holds the types and constants, so client components can
// import it.

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
  // A paste slug, or undefined for all pastes. Beats `collection` when both are given.
  paste?: string
  // A collection slug, for the pastes filed in it.
  collection?: string
}

export interface Kpi {
  id: MetricId
  label: string
  value: number
  // Percent change against the previous period of the same length, or null when that period had
  // none of this to compare with.
  delta: number | null
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
  // How many pastes the figures cover.
  pasteCount: number
  // The paste or collection the figures are limited to, if any. `title` is the collection's name
  // for a collection.
  scope: { type: "paste" | "collection"; slug: string; title: string } | null
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

export const POINT_COUNT: Record<AnalyticsRange, number> = {
  "24h": 24,
  "7d": 7,
  "30d": 30,
  "90d": 90,
}
