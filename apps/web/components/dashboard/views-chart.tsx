import { cn } from "@sniptide/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { DitherBar } from "@/components/charts/dither-bar"
import { formatNumber } from "@/lib/format"

// The dashboard and account usage share dithered bars, with the peak in pink.
export function ViewsBarChart({
  values,
  labels,
  label,
  className,
}: {
  values: number[]
  labels: string[]
  // Replaces the default "views per day" name for charts of other series.
  label?: string
  className?: string
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const max = Math.max(1, ...values)
  const peak = values.indexOf(max)
  const dense = values.length > 10

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div
        role="img"
        aria-label={
          label ??
          t("views_per_day", {
            values: values
              .map((value, index) => `${labels[index]} ${formatNumber(value, locale)}`)
              .join(", "),
          })
        }
        className={cn(
          // Keep a definite height when the parent is auto-sized, including on desktop.
          "flex h-40 flex-auto items-end border-b border-foreground",
          dense ? "gap-1" : "gap-2.5",
        )}
      >
        {values.map((value, index) => (
          <div
            key={`${labels[index]}-${index}`}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
          >
            {index === peak && value > 0 ? (
              <span className="rounded-sm bg-foreground px-1.5 py-[3px] font-mono text-[11px] leading-[14px] text-background">
                {formatNumber(value, locale)}
              </span>
            ) : null}
            <DitherBar
              highlight={index === peak && value > 0}
              compact={dense}
              style={{ height: `${Math.max(3, (value / max) * 82)}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption
        aria-hidden="true"
        className={cn("flex text-xs text-muted-foreground", dense ? "gap-1" : "gap-2.5")}
      >
        {labels.map((label, index) => {
          // Skipped labels keep their slot but drop the text, so it cannot overflow the lane.
          const skipped = dense && index % 5 !== values.length % 5
          return (
            <span
              key={`${label}-${index}`}
              className={cn(
                "min-w-0 flex-1 text-center whitespace-nowrap",
                index === peak && "font-semibold text-foreground",
              )}
            >
              {skipped ? null : label}
            </span>
          )
        })}
      </figcaption>
    </figure>
  )
}
