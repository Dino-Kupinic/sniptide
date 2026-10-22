"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { formatNumber } from "@/lib/format"
import type { AnalyticsReport, MetricId } from "@/lib/pastes/analytics"
import { ViewsChart } from "./views-chart"

function formatDelta(delta: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(delta / 100)
}

// The four tiles and the chart under them. A tile picks which metric the chart draws; Views is
// selected to begin with and marked by a blue top border. `empty` (no views in the period) drops
// the chart on phones, where the page shows its own empty state instead.
export function Overview({
  kpis,
  points,
  rangeLabel,
  empty = false,
}: Pick<AnalyticsReport, "kpis" | "points" | "rangeLabel"> & { empty?: boolean }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const [selected, setSelected] = React.useState<MetricId>("views")
  const current = kpis.find((kpi) => kpi.id === selected) ?? kpis[0]

  return (
    <>
      <div
        role="radiogroup"
        aria-label={t("chart_metric")}
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-border lg:grid-cols-4"
      >
        {kpis.map((kpi, index) => {
          const active = kpi.id === selected

          return (
            // biome-ignore lint/a11y/useSemanticElements: a tile that holds a number and a delta isn't a native radio input.
            <button
              key={kpi.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(kpi.id)}
              className={cn(
                "relative flex flex-col items-start gap-1.5 px-4 pt-4 pb-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset lg:px-5",
                // Two columns on phones, four from lg: hairlines between tiles, none on the outside.
                index % 2 === 0 && "border-r",
                index < 2 && "border-b lg:border-b-0",
                index === 1 && "lg:border-r",
                // The selected tile gets a blue bar inset from its edges, so it never meets a rounded corner.
                active &&
                  "bg-sidebar before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-b-sm before:bg-link lg:before:inset-x-5",
              )}
            >
              <span
                className={cn(
                  "text-[13px] leading-[18px]",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {kpi.label}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-heading text-[26px] leading-9 font-bold tracking-[-0.02em] tabular-nums lg:text-[30px]">
                  {formatNumber(kpi.value, locale)}
                </span>
                {kpi.delta === null ? null : (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      kpi.delta >= 0 ? "text-link" : "text-muted-foreground",
                    )}
                  >
                    {formatDelta(kpi.delta, locale)}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <ViewsChart
        title={current?.label ?? t("views")}
        rangeLabel={rangeLabel}
        points={points}
        metric={selected}
        className={empty ? "max-lg:hidden" : undefined}
      />
    </>
  )
}
