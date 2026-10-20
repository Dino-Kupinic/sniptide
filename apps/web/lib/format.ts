// Display helpers for paste metadata. They run on the server, so relative times are computed
// once per render and handed to client components as strings.

import type { Locale } from "@/lib/i18n/config"
import { DAY, HOUR, MINUTE } from "@/lib/time"

const expiredLabels: Record<Locale, string> = {
  en: "expired",
  de: "abgelaufen",
  es: "caducado",
  zh: "已过期",
  ja: "期限切れ",
}

export function formatNumber(value: number, locale: string = "en") {
  return new Intl.NumberFormat(locale).format(value)
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`
}

// "2 min ago", "1 hour ago", "Yesterday", "3 days ago", "1 week ago", then a date.
export function timeAgo(time: number, now = Date.now(), locale: string = "en") {
  if (locale !== "en") {
    const elapsed = Math.max(0, now - time)
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
    if (elapsed < MINUTE) return relative.format(0, "second")
    if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute")
    if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour")
    if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), "day")
    if (elapsed < 14 * DAY) return relative.format(-1, "week")
    return formatDate(time, locale)
  }
  const elapsed = Math.max(0, now - time)
  if (elapsed < MINUTE) return "just now"
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${plural(Math.floor(elapsed / HOUR), "hour")} ago`
  if (elapsed < 2 * DAY) return "Yesterday"
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`
  if (elapsed < 14 * DAY) return "1 week ago"
  return formatDate(time)
}

// "in 14 hours", "in 6 days", "in 2 months". Callers handle `null` (never) themselves.
export function timeUntil(time: number, now = Date.now(), locale: Locale = "en") {
  if (locale !== "en") {
    const remaining = time - now
    if (remaining <= 0) return expiredLabels[locale]
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" })
    if (remaining < HOUR)
      return relative.format(Math.max(1, Math.round(remaining / MINUTE)), "minute")
    if (remaining < DAY) return relative.format(Math.round(remaining / HOUR), "hour")
    if (remaining < 45 * DAY) return relative.format(Math.round(remaining / DAY), "day")
    return relative.format(Math.round(remaining / (30 * DAY)), "month")
  }
  const remaining = time - now
  if (remaining <= 0) return "expired"
  if (remaining < HOUR) return `in ${plural(Math.max(1, Math.round(remaining / MINUTE)), "minute")}`
  if (remaining < DAY) return `in ${plural(Math.round(remaining / HOUR), "hour")}`
  if (remaining < 45 * DAY) return `in ${plural(Math.round(remaining / DAY), "day")}`
  return `in ${plural(Math.round(remaining / (30 * DAY)), "month")}`
}

export function formatDate(time: number, locale: string = "en") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(time)
}

export function formatDateTime(time: number, locale: string = "en") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(time)
}

export function formatBytes(bytes: number, locale: string = "en") {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  if (bytes < 1024) return `${formatNumber(bytes, locale)} B`
  if (bytes < 1024 * 1024) return `${number.format(bytes / 1024)} KB`
  return `${number.format(bytes / 1024 / 1024)} MB`
}

// A size limit as people write it: "1 MB", "512 KB", "1.5 MB".
export function formatLimit(bytes: number) {
  return formatBytes(bytes).replace(".0 ", " ")
}

export function byteLength(text: string) {
  return new TextEncoder().encode(text).length
}

// "JD" for "Jane Doe" or "jane.doe", "JA" for "jane": first and last word, else the first two
// letters.
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" })

export function initials(name: string) {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (words.length > 1 && /^(jr|sr|ii|iii|iv|v)$/i.test(words.at(-1) ?? "")) words.pop()
  const first = words[0] ?? ""
  const last = words.length > 1 ? words.at(-1) : undefined
  const firstLetters = [...graphemes.segment(first)].map(({ segment }) => segment)
  const lastLetter = last ? [...graphemes.segment(last)][0]?.segment : undefined
  const letters = lastLetter
    ? `${firstLetters[0] ?? ""}${lastLetter}`
    : firstLetters.slice(0, 2).join("")
  return letters.toUpperCase() || "?"
}

export function lineCount(text: string) {
  return text.replace(/\n$/, "").split("\n").length
}
