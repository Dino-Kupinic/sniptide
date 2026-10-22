import { cn } from "@sniptide/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { formatNumber } from "@/lib/format"
import type { SeriesPoint } from "@/lib/pastes/analytics"
import { formatTick, labelIndexes, niceScale } from "./chart-scale"

// Height of the plot in px; bars are drawn against it, so the y axis labels line up with the grid.
const PLOT = 240
// Bars shorter than this lose their striped cap (three ink rules) and draw as one block.
const CAP_MIN = 20
// More daily bars than this (the 90 day range) are summed into weeks below lg, where a day would
// be a 2px sliver.
const WEEKLY_FROM = 32

// Sums runs of seven days into one point, labelled with the week's first day.
function toWeeks(points: SeriesPoint[]): SeriesPoint[] {
  const weeks: SeriesPoint[] = []
  for (let start = 0; start < points.length; start += 7) {
    const days = points.slice(start, start + 7)
    const first = days[0]
    if (!first) continue
    const values = { ...first.values }
    for (const day of days.slice(1)) {
      for (const key of Object.keys(values) as (keyof typeof values)[])
        values[key] += day.values[key]
    }
    weeks.push({ date: first.date, label: first.label, values })
  }
  return weeks
}

// The Analytics bar chart: link-blue bars capped with three thin ink rules, the peak in ink with
// its value above it. Tapping or arrowing to a bar shows its value in place of the range label.
export function ViewsChart({
  className,
  ...props
}: {
  title: string
  rangeLabel: string
  points: SeriesPoint[]
  metric: keyof SeriesPoint["values"]
  className?: string
}) {
  const weeks = React.useMemo(() => toWeeks(props.points), [props.points])
  if (props.points.length < WEEKLY_FROM) return <Chart {...props} className={className} />
  return (
    <>
      <Chart {...props} points={weeks} weekly className={cn("lg:hidden", className)} />
      <Chart {...props} className={cn("max-lg:hidden", className)} />
    </>
  )
}

function Chart({
  title,
  rangeLabel,
  points,
  metric,
  weekly = false,
  className,
}: {
  title: string
  rangeLabel: string
  points: SeriesPoint[]
  metric: keyof SeriesPoint["values"]
  weekly?: boolean
  className?: string
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const id = React.useId()
  const barsRef = React.useRef<HTMLDivElement>(null)
  const [selected, setSelected] = React.useState<number | null>(null)
  const values = points.map((point) => point.values[metric])
  const biggest = Math.max(0, ...values)
  const peak = biggest > 0 ? values.indexOf(biggest) : -1
  const { max, ticks } = niceScale(biggest)
  const labels = labelIndexes(points.length, peak)
  const total = values.reduce((sum, value) => sum + value, 0)
  const peakPoint = points[peak]
  const focusIndex = selected ?? (peak >= 0 ? peak : points.length - 1)
  const selectedPoint = selected === null ? undefined : points[selected]

  // A new metric or range starts with nothing selected.
  React.useEffect(() => setSelected(null), [metric, points])

  const pointLabel = (point: SeriesPoint) =>
    weekly ? t("week_of", { day: point.label }) : point.label

  function move(index: number) {
    const next = Math.max(0, Math.min(points.length - 1, index))
    setSelected(next)
    barsRef.current?.querySelectorAll("button")[next]?.focus()
  }

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
      aria-labelledby={`${id}-title`}
      className={cn(
        "rounded-lg flex flex-col gap-4 border border-border px-4 pt-4 pb-3.5 lg:px-5 lg:pt-5",
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </h2>
        <p aria-live="polite" className="text-[13px] text-muted-foreground">
          {selectedPoint ? (
            <span className="text-foreground">
              {t("chart_point", {
                day: pointLabel(selectedPoint),
                value: formatNumber(values[selected ?? 0] ?? 0, locale),
              })}
            </span>
          ) : (
            rangeLabel
          )}
        </p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground lg:hidden">{t("chart_empty")}</p>
      ) : null}

      <table className="sr-only">
        <caption>
          {title}, {rangeLabel}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("chart_date")}</th>
            <th scope="col">{title}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.date}>
              <th scope="row">{pointLabel(point)}</th>
              <td>{formatNumber(values[index] ?? 0, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={cn("flex gap-2 lg:gap-3", total === 0 && "max-lg:hidden")}>
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
          {/* biome-ignore lint/a11y/useSemanticElements: a plot of bar buttons, not a form field set. */}
          <div
            role="group"
            aria-label={
              peakPoint
                ? t("chart_summary_peak", {
                    title,
                    range: rangeLabel,
                    total: formatNumber(total, locale),
                    peak: formatNumber(biggest, locale),
                    day: pointLabel(peakPoint),
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

            <div ref={barsRef} className={cn("relative flex grow items-end pb-px", gap)}>
              {points.map((point, index) => {
                const value = values[index] ?? 0
                const height = Math.max(2, (value / max) * PLOT)
                const isPeak = index === peak

                return (
                  // Each bar is a full-height button, so a tap anywhere in its column picks it.
                  <button
                    key={point.date}
                    type="button"
                    tabIndex={index === focusIndex ? 0 : -1}
                    aria-label={t("chart_point", {
                      day: pointLabel(point),
                      value: formatNumber(value, locale),
                    })}
                    aria-pressed={selected === index}
                    title={`${pointLabel(point)}: ${formatNumber(value, locale)}`}
                    onClick={() => setSelected(selected === index ? null : index)}
                    onKeyDown={(event) => {
                      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
                      if (step) move(index + step)
                      else if (event.key === "Home") move(0)
                      else if (event.key === "End") move(points.length - 1)
                      else if (event.key === "Escape") setSelected(null)
                      else return
                      event.preventDefault()
                    }}
                    className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:bg-muted"
                  >
                    <span
                      className="relative flex flex-col justify-end gap-0.5 hover:opacity-80"
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
                      <span
                        className={cn("min-h-0 flex-1", isPeak ? "bg-foreground" : "bg-link")}
                      />
                    </span>
                  </button>
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
