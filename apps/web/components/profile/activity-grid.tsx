import { cn } from "@sniptide/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { ACTIVITY_DAYS } from "@/lib/profiles"
import { DAY } from "@/lib/time"

// Weeks a phone shows; wider screens show the whole year.
const PHONE_WEEKS = 26

function isoDay(time: number) {
  return new Date(time).toISOString().slice(0, 10)
}

// The fill for a day. Busy days are ranked against the year's other active days, so one big day
// doesn't wash out the rest. The busiest day takes the highlight color, like the peak of every
// other Sniptide chart. Dark mode uses the lighter link blue so the faint steps stay visible.
function level(count: number, cuts: number[], peak: boolean) {
  if (count === 0) return "bg-muted"
  if (peak) return "bg-highlight"
  if (count > (cuts[2] ?? 0)) return "bg-chart-1 dark:bg-link"
  if (count > (cuts[1] ?? 0)) return "bg-chart-1/70 dark:bg-link/75"
  if (count > (cuts[0] ?? 0)) return "bg-chart-1/45 dark:bg-link/50"
  return "bg-chart-1/25 dark:bg-link/30"
}

function quartiles(counts: number[]) {
  const sorted = counts.filter((count) => count > 0).sort((a, b) => a - b)
  return [0.25, 0.5, 0.75].map((share) => sorted[Math.floor(share * (sorted.length - 1))] ?? 0)
}

// A year of public pastes as a grid of days, one column per week (Sunday on top), newest week on
// the right. Only public pastes count, so the grid shows nothing the profile list doesn't.
export function ActivityGrid({
  activity,
  now = Date.now(),
}: {
  activity: Record<string, number>
  now?: number
}) {
  const t = useTranslations("Profile")
  const locale = useLocale()
  const today = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  )
  // The Sunday that starts the oldest column.
  const first = today - (ACTIVITY_DAYS - 7 + new Date(today).getUTCDay()) * DAY
  const weekCount = Math.floor((today - first) / (7 * DAY)) + 1
  const days = Array.from({ length: weekCount * 7 }, (_, index) => {
    const time = first + index * DAY
    return { time, key: isoDay(time), count: activity[isoDay(time)] ?? 0, future: time > today }
  })
  const total = days.reduce((sum, day) => sum + day.count, 0)
  const max = Math.max(0, ...days.map((day) => day.count))
  const cuts = quartiles(days.map((day) => day.count))
  const peak = max > 0 ? days.find((day) => day.count === max) : undefined
  const date = (time: number) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(
      time,
    )
  const month = (time: number) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(time)
  const weeks = Array.from({ length: weekCount }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  )
  const summary = t("activitySummary", { count: total })

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <div role="img" aria-label={summary}>
        <div aria-hidden="true" className="flex gap-[3px]">
          {weeks.map((week, index) => {
            const start = week[0]?.time ?? first
            const newMonth =
              index === 0 ||
              new Date(start).getUTCMonth() !== new Date(start - 7 * DAY).getUTCMonth()
            return (
              <div
                key={start}
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-[3px]",
                  index < weekCount - PHONE_WEEKS && "max-sm:hidden",
                )}
              >
                <span className="h-4 overflow-visible text-[11px] leading-4 whitespace-nowrap text-muted-foreground">
                  {newMonth && index < weekCount - 2 ? month(start) : ""}
                </span>
                {week.map((day) => (
                  <span
                    key={day.key}
                    title={
                      day.future
                        ? undefined
                        : t("activityDay", { count: day.count, date: date(day.time) })
                    }
                    className={cn(
                      "aspect-square w-full rounded-sm",
                      day.future ? "invisible" : level(day.count, cuts, day === peak),
                    )}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <figcaption className="text-[13px] text-muted-foreground">
        {summary}
      </figcaption>
    </figure>
  )
}
