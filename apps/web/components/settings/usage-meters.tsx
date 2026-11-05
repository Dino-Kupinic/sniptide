import { AlertTriangleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { ProgressBar } from "@/components/dithercn/progress-bar"
import { usageLimitState } from "@/lib/account/usage-display"
import { ditherSettings } from "@/lib/dither/settings"

export type UsageMetric = {
  label: string
  used: number
  limit: number | null
  format: (value: number) => string
}

// One panel of counts, with a meter under each count that has a limit.
export function UsageMeters({ metrics }: { metrics: UsageMetric[] }) {
  const t = useTranslations("Settings")
  return (
    <ul className="flex flex-col rounded-lg border border-border">
      {metrics.map((metric) => {
        const state = usageLimitState(metric.used, metric.limit)
        return (
          <li
            key={metric.label}
            className="flex flex-col gap-3 border-t border-border px-4 py-3.5 first:border-t-0"
          >
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-medium">{metric.label}</span>
              <span className="text-right text-muted-foreground tabular-nums">
                {metric.limit === null
                  ? metric.format(metric.used)
                  : t("usageOfLimit", {
                      used: metric.format(metric.used),
                      limit: metric.format(metric.limit),
                    })}
              </span>
            </div>
            {state.kind === "limited" ? (
              <>
                <ProgressBar
                  value={state.percent}
                  label={metric.label}
                  hideLabel
                  size="sm"
                  color="--primary"
                  valueText={t("usageOfLimit", {
                    used: metric.format(metric.used),
                    limit: metric.format(metric.limit ?? 0),
                  })}
                  {...ditherSettings}
                />
                {state.status === "normal" ? null : (
                  <p className="flex items-center gap-1.5 text-[13px] font-medium">
                    <AlertTriangleIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    {t(state.status === "full" ? "usageFull" : "usageWarning")}
                  </p>
                )}
              </>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
