import { cn } from "@sniptide/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { formatNumber } from "@/lib/format"
import type { SeriesPoint } from "@/lib/pastes/analytics"
import { formatTick, labelIndexes, niceScale } from "./chart-scale"

// Height of the plot in px; bars are drawn against it, so the y axis labels line up with the grid.
const PLOT = 240
// Bars shorter than this lose their striped cap (three ink rules) and draw as one block.
const CAP_MIN = 20

// The Analytics bar chart: link-blue bars capped with three thin ink rules, the peak in ink with
// its value above it.
export function ViewsChart({
  title,
  rangeLabel,
  points,
  metric,
}: {
  title: string
  rangeLabel: string
  points: SeriesPoint[]
  metric: keyof SeriesPoint["values"]
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const values = points.map((point) => point.values[metric])
  const biggest = Math.max(0, ...values)
  const peak = biggest > 0 ? values.indexOf(biggest) : -1
  const { max, ticks } = niceScale(biggest)
  const labels = labelIndexes(points.length, peak)
  const total = values.reduce((sum, value) => sum + value, 0)
  const peakPoint = points[peak]

  const gap =
    points.length <= 7
      ? "gap-3"
      : points.length <= 24
        ? "gap-1.5"
        : points.length <= 30
          ? "gap-1 lg:gap-2"
          : "gap-px lg:gap-0.5"

  return (
    <section
      aria-labelledby="views-chart-title"
      className="rounded-lg flex flex-col gap-4 border border-border px-4 pt-4 pb-3.5 lg:px-5 lg:pt-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="views-chart-title" className="text-sm font-semibold">
            {title}
          </h2>
          <p className="text-[13px] text-muted-foreground">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-4 pt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 bg-link" />
            {title}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 bg-foreground" />
            {t("peak_day")}
          </span>
        </div>
      </div>

      <div className="flex gap-2 lg:gap-3">
        <div aria-hidden="true" className="relative h-[246px] w-8 shrink-0 lg:w-8.5">
          {ticks.map((tick, index) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 font-mono text-[11px] leading-[14px] text-muted-foreground"
              style={{ top: 6 + PLOT - (index * PLOT) / (ticks.length - 1) }}
            >
              {formatTick(tick, locale)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            role="img"
            aria-label={
              peakPoint
                ? t("chart_summary_peak", {
                    title,
                    range: rangeLabel,
                    total: formatNumber(total, locale),
                    peak: formatNumber(biggest, locale),
                    day: peakPoint.label,
                  })
                : t("chart_summary", {
                    title,
                    range: rangeLabel,
                    total: formatNumber(total, locale),
                  })
            }
            className="relative flex h-[246px] flex-col"
          >
            <div className="absolute inset-x-0 top-1.5 flex h-60 flex-col justify-between">
              {ticks.map((tick, index) => (
                <span
                  key={tick}
                  className={cn(
                    "h-px shrink-0",
                    index === ticks.length - 1 ? "bg-foreground" : "bg-border/70",
                  )}
                />
              ))}
            </div>

            <div className={cn("relative flex grow items-end pb-px", gap)}>
              {points.map((point, index) => {
                const value = values[index] ?? 0
                const height = Math.max(2, (value / max) * PLOT)
                const isPeak = index === peak

                return (
                  <div
                    key={point.date}
                    title={`${point.label}: ${formatNumber(value, locale)}`}
                    className="relative flex min-w-0 flex-1 flex-col justify-end gap-0.5 hover:opacity-80"
                    style={{ height }}
                  >
                    {isPeak ? (
                      <span className="rounded-sm absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 bg-foreground px-1.5 py-[3px] font-mono text-[11px] leading-[14px] whitespace-nowrap text-background">
                        {formatNumber(value, locale)}
                      </span>
                    ) : null}
                    {height >= CAP_MIN ? (
                      <>
                        <span className="h-px shrink-0 bg-foreground" />
                        <span className="h-0.5 shrink-0 bg-foreground" />
                        <span className="h-[3px] shrink-0 bg-foreground" />
                      </>
                    ) : null}
                    <span className={cn("min-h-0 flex-1", isPeak ? "bg-foreground" : "bg-link")} />
                  </div>
                )
              })}
            </div>
          </div>

          <div aria-hidden="true" className="relative mt-2.5 h-4 text-xs text-muted-foreground">
            {points.map((point, index) => {
              if (!labels.has(index)) return null
              const first = index === 0
              const last = index === points.length - 1

              return (
                <span
                  key={point.date}
                  className={cn(
                    "absolute top-0 whitespace-nowrap",
                    index === peak && "font-semibold text-foreground",
                    !(first || last) && "-translate-x-1/2",
                  )}
                  style={
                    first
                      ? { left: 0 }
                      : last
                        ? { right: 0 }
                        : { left: `${((index + 0.5) / points.length) * 100}%` }
                  }
                >
                  {point.label}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
