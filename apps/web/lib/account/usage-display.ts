import { DAY } from "@/lib/time"

export type UsageLimitState =
  | { kind: "unlimited" }
  | { kind: "limited"; percent: number; status: "normal" | "warning" | "full" }

export function usageLimitState(used: number, limit: number | null): UsageLimitState {
  if (limit === null) return { kind: "unlimited" }
  const ratio = limit <= 0 ? Infinity : used / limit
  return {
    kind: "limited",
    percent: Math.max(0, Math.min(100, ratio * 100)),
    status: ratio >= 1 ? "full" : ratio >= 0.8 ? "warning" : "normal",
  }
}

export type UsageDay = { date: string; requests: number }

export function usageHistory(
  rows: ReadonlyArray<{ day: number; requests: number }>,
  today: number,
  days: number,
): { days: UsageDay[]; total: number } {
  const first = today - days + 1
  const counts = new Map<number, number>()
  for (const row of rows) {
    if (row.day >= first && row.day <= today) {
      counts.set(row.day, (counts.get(row.day) ?? 0) + row.requests)
    }
  }
  const result = Array.from({ length: days }, (_, index) => {
    const day = first + index
    return { date: new Date(day * DAY).toISOString().slice(0, 10), requests: counts.get(day) ?? 0 }
  })
  return { days: result, total: result.reduce((sum, day) => sum + day.requests, 0) }
}
