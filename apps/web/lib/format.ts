// Display helpers for paste metadata. They run on the server, so relative times are computed
// once per render and handed to client components as strings.

import { DAY, HOUR, MINUTE } from "@/lib/time"

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})
const numberFormat = new Intl.NumberFormat("en-US")

export function formatNumber(value: number) {
  return numberFormat.format(value)
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`
}

// "2 min ago", "1 hour ago", "Yesterday", "3 days ago", "1 week ago", then a date.
export function timeAgo(time: number, now = Date.now()) {
  const elapsed = Math.max(0, now - time)
  if (elapsed < MINUTE) return "just now"
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${plural(Math.floor(elapsed / HOUR), "hour")} ago`
  if (elapsed < 2 * DAY) return "Yesterday"
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`
  if (elapsed < 14 * DAY) return "1 week ago"
  return dateFormat.format(time)
}

// "in 14 hours", "in 6 days", "in 2 months". Callers handle `null` (never) themselves.
export function timeUntil(time: number, now = Date.now()) {
  const remaining = time - now
  if (remaining <= 0) return "expired"
  if (remaining < HOUR) return `in ${plural(Math.max(1, Math.round(remaining / MINUTE)), "minute")}`
  if (remaining < DAY) return `in ${plural(Math.round(remaining / HOUR), "hour")}`
  if (remaining < 45 * DAY) return `in ${plural(Math.round(remaining / DAY), "day")}`
  return `in ${plural(Math.round(remaining / (30 * DAY)), "month")}`
}

export function formatDate(time: number) {
  return dateFormat.format(time)
}

export function formatDateTime(time: number) {
  return dateTimeFormat.format(time).replace(",", ",")
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function byteLength(text: string) {
  return new TextEncoder().encode(text).length
}

// "JD" for "Jane Doe" or "jane.doe", "JA" for "jane": first and last word, else the first two
// letters.
export function initials(name: string) {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  const first = words[0] ?? ""
  const last = words.length > 1 ? words.at(-1) : undefined
  const letters = last ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2)
  return letters.toUpperCase() || "?"
}

export function lineCount(text: string) {
  return text.replace(/\n$/, "").split("\n").length
}
