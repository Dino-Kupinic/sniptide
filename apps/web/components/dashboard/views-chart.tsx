"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { DitherBar } from "@/components/charts/dither-bar"
import { useBarInteraction } from "@/components/charts/use-bar-interaction"
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
  const interaction = useBarInteraction(
    values.length,
    Math.max(peak, 0),
    `${values.join(",")}:${labels.join(",")}`,
  )
  const active = interaction.active

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: chart columns are a group of controls, not form fields. */}
      <div
        ref={interaction.barsRef}
        onPointerLeave={interaction.clearPreview}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) interaction.clearPreview()
        }}
        role="group"
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
          <button
            key={`${labels[index]}-${index}`}
            type="button"
            {...interaction.buttonProps(index)}
            aria-label={`${labels[index]}: ${formatNumber(value, locale)}`}
            className="relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:bg-muted"
          >
            {(active === null ? index === peak && value > 0 : active === index) ? (
              <span
                style={{
                  bottom: `${value === 0 ? 0.6 : Math.max(3, (value / max) * 82)}%`,
                  ...(index === 0 ? { left: 0 } : index === values.length - 1 ? { right: 0 } : {}),
                }}
                className="pointer-events-none absolute z-10 w-max max-w-44 mb-1.5 rounded-sm bg-foreground px-1.5 py-[3px] font-mono text-[11px] leading-[14px] text-background"
              >
                {active === index ? `${labels[index]}: ` : null}
                {formatNumber(value, locale)}
              </span>
            ) : null}
            <DitherBar
              highlight={index === peak && value > 0}
              active={active === index}
              style={{ height: `${value === 0 ? 0.6 : Math.max(3, (value / max) * 82)}%` }}
            />
          </button>
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
