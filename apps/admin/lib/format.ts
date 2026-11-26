// English formatting for the admin pages, which only the operator reads.

export function people(count: number) {
  return `${new Intl.NumberFormat("en-US").format(count)} ${count === 1 ? "person" : "people"}`
}

export function formatDate(date: Date, style: "medium" | "long" = "medium") {
  return new Intl.DateTimeFormat("en-US", { dateStyle: style, timeZone: "UTC" }).format(date)
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
]

export function relativeTime(date: Date, now: Date) {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size || unit === "second")
      return format.format(Math.round(seconds / size), unit)
  return format.format(0, "second")
}

// A share of a limit, such as "84%". Shares above 100% show as they are.
export function percent(share: number) {
  return `${Math.round(share * 100)}%`
}

// Bytes in binary units, the same as the app shows: "512 KB", "84.2 MB".
export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)} ${units[unit]}`
}
