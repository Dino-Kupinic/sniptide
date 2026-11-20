"use client"

import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  GroupedCanvas,
  GroupedChevron,
  GroupedList,
  groupedPanelClass,
} from "@/components/lists/grouped-list"
import { formatNumber } from "@/lib/format"
import type { AnalyticsRange, AnalyticsReport } from "@/lib/pastes/analytics"

const RANGES = [
  { value: "7d", label: "7_days" },
  { value: "30d", label: "30_days" },
  { value: "90d", label: "90_days" },
] as const satisfies { value: AnalyticsRange; label: string }[]

// The Analytics page below lg: a range switch, one chart card for views with the busiest day in
// the highlight color, the other totals as rows, and the top pastes, each leading to its own
// figures. Desktop keeps the tiles and panels.
export function PhoneAnalytics({
  report,
  paste,
}: {
  report: Pick<AnalyticsReport, "range" | "kpis" | "points" | "topPastes">
  // The paste the figures are limited to, kept when the range changes.
  paste?: string
}) {
  const t = useTranslations("Workspace")
  const locale = useLocale()
  const [views, ...others] = report.kpis
  const values = report.points.map((point) => point.values.views)
  const max = Math.max(1, ...values)
  const peak = values.some((value) => value > 0) ? values.indexOf(max) : -1
  const href = (range: AnalyticsRange) =>
    `/analytics?${new URLSearchParams({ range, ...(paste ? { paste } : {}) })}`

  return (
    <div className="flex flex-col gap-7 lg:hidden">
      <GroupedCanvas />
      <nav
        aria-label={t("range")}
        className="-mt-2 flex gap-0.5 rounded-lg bg-foreground/[0.06] p-[3px] dark:bg-muted"
      >
        {RANGES.map((range) => (
          <Link
            key={range.value}
            href={href(range.value)}
            aria-current={report.range === range.value ? "page" : undefined}
            className="flex h-7 flex-1 items-center justify-center rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
          >
            {t(range.label)}
          </Link>
        ))}
      </nav>

      {views ? (
        <section aria-label={views.label} className={cn(groupedPanelClass, "gap-3 p-4")}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] leading-4 text-muted-foreground">{t("views")}</h2>
            {views.delta !== null ? (
              <span className="truncate text-[13px] leading-4 text-muted-foreground">
                {t("analytics_delta", {
                  delta: new Intl.NumberFormat(locale, {
                    style: "percent",
                    signDisplay: "exceptZero",
                    maximumFractionDigits: 0,
                  }).format(views.delta / 100),
                })}
              </span>
            ) : null}
          </div>
          <p className="font-heading text-[34px] leading-[41px] font-bold tracking-[-0.02em] tabular-nums">
            {formatNumber(views.value, locale)}
          </p>
          {/* With no views in the range, the total stands alone and the page's empty state explains. */}
          {peak >= 0 ? (
            <>
              <ol className="flex h-28 items-end gap-[3px]">
                {report.points.map((point, index) => (
                  <li key={point.date} className="flex h-full min-w-0 flex-1 items-end">
                    <span className="sr-only">
                      {point.label}: {t("views_count", { count: point.values.views })}
                    </span>
                    <span
                      aria-hidden
                      style={{ height: `${Math.max(3, (point.values.views / max) * 100)}%` }}
                      className={cn(
                        "w-full rounded-[2px]",
                        point.values.views === 0
                          ? "bg-muted"
                          : index === peak
                            ? "bg-highlight"
                            : "bg-chart-1",
                      )}
                    />
                  </li>
                ))}
              </ol>
              <div
                aria-hidden
                className="flex justify-between gap-2 text-[12px] leading-4 text-muted-foreground"
              >
                <span>{report.points[0]?.label}</span>
                <span className="truncate">
                  {t("analytics_peak", {
                    value: formatNumber(max, locale),
                    day: report.points[peak]?.label ?? "",
                  })}
                </span>
                <span>{report.points.at(-1)?.label}</span>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <GroupedList>
        {others.map((kpi) => (
          <li
            key={kpi.id}
            className="group/item flex min-h-[50px] items-center pl-4 text-[17px] leading-[22px]"
          >
            <span className="flex min-h-[50px] flex-1 items-center gap-3 self-stretch pr-4 group-not-last/item:border-b group-not-last/item:border-border">
              <span className="flex-1">{kpi.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(kpi.value, locale)}
              </span>
            </span>
          </li>
        ))}
      </GroupedList>

      {report.topPastes.length > 0 ? (
        <GroupedList label={t("top_pastes")}>
          {report.topPastes.slice(0, 5).map((row) => (
            <li key={row.slug} className="group/item">
              <Link
                href={`/analytics?${new URLSearchParams({ range: report.range, paste: row.slug })}`}
                className="flex min-h-[50px] items-center pl-4 text-[17px] leading-[22px] outline-none active:bg-muted focus-visible:bg-muted"
              >
                <span className="flex min-h-[50px] min-w-0 flex-1 items-center gap-2 self-stretch pr-4 group-not-last/item:border-b group-not-last/item:border-border">
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {formatNumber(row.views, locale)}
                  </span>
                  <GroupedChevron />
                </span>
              </Link>
            </li>
          ))}
        </GroupedList>
      ) : null}
    </div>
  )
}
