"use client"

import { cn } from "@sniptide/ui/lib/utils"
import * as React from "react"
import { formatNumber } from "@/lib/format"
import type { AnalyticsReport, MetricId } from "@/lib/pastes/analytics"
import { ViewsChart } from "./views-chart"

function formatDelta(delta: number) {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : ""
  return `${sign}${Math.abs(delta).toFixed(1)}%`
}

// The four tiles and the chart under them. A tile picks which metric the chart draws; Views is
// selected to begin with and marked by a blue top border.
export function Overview({
  kpis,
  points,
  rangeLabel,
}: Pick<AnalyticsReport, "kpis" | "points" | "rangeLabel">) {
  const [selected, setSelected] = React.useState<MetricId>("views")
  const current = kpis.find((kpi) => kpi.id === selected) ?? kpis[0]

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Chart metric"
        className="grid grid-cols-2 border border-border lg:grid-cols-4"
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
                "flex flex-col items-start gap-1.5 border-t-2 px-4 pt-3.5 pb-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset lg:px-5",
                // Two columns on phones, four from lg: hairlines between tiles, none on the outside.
                index % 2 === 0 && "border-r",
                index < 2 && "border-b lg:border-b-0",
                index === 1 && "lg:border-r",
                active ? "border-t-link bg-sidebar" : "border-t-transparent",
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
                  {formatNumber(kpi.value)}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    kpi.delta >= 0 ? "text-link" : "text-muted-foreground",
                  )}
                >
                  {formatDelta(kpi.delta)}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <ViewsChart
        title={current?.label ?? "Views"}
        rangeLabel={rangeLabel}
        points={points}
        metric={selected}
      />
    </>
  )
}
