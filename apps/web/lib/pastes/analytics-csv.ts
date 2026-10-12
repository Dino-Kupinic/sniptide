import { type AnalyticsReport, METRICS } from "./analytics"

// The chart's data as a CSV: one row per day (per hour in the 24h range), a column per metric.
const COLUMNS = ["date", "views", "unique_visitors", "code_copies", "raw_api_hits"]

export function analyticsCsv(report: AnalyticsReport) {
  const rows = report.points.map((point) =>
    [point.date, ...METRICS.map((metric) => point.values[metric.id])].join(","),
  )
  return `${[COLUMNS.join(","), ...rows].join("\n")}\n`
}

export function analyticsCsvName(report: AnalyticsReport) {
  const scope = report.scope ? `-${report.scope.slug}` : ""
  return `sniptide-analytics${scope}-${report.range}.csv`
}
