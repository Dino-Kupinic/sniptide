import { cn } from "@sniptide/ui/lib/utils"
import { formatNumber } from "@/lib/format"

// Bar chart from the dashboard artboard: primary bars capped with three thin ink rules, the
// peak day in ink with its value above it. Thirty-day ranges drop the caps and most labels.
export function ViewsBarChart({
  values,
  labels,
  className,
}: {
  values: number[]
  labels: string[]
  className?: string
}) {
  const max = Math.max(1, ...values)
  const peak = values.indexOf(max)
  const dense = values.length > 10

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div
        role="img"
        aria-label={`Views per day: ${values.map((value, index) => `${labels[index]} ${value}`).join(", ")}`}
        className={cn(
          // A definite height on phones (percent bar heights need one); on desktop it fills the card.
          "flex h-40 items-end border-b border-foreground lg:h-auto lg:min-h-42 lg:flex-1",
          dense ? "gap-1" : "gap-2.5",
        )}
      >
        {values.map((value, index) => (
          <div
            key={`${labels[index]}-${index}`}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            {index === peak && value > 0 ? (
              <span className="bg-foreground px-1.5 py-[3px] font-mono text-[11px] leading-[14px] text-background">
                {formatNumber(value)}
              </span>
            ) : null}
            <div
              className="flex w-full flex-col gap-0.5"
              style={{ height: `${Math.max(3, (value / max) * 82)}%` }}
            >
              {dense ? null : (
                <>
                  <span className="h-px shrink-0 bg-foreground" />
                  <span className="h-0.5 shrink-0 bg-foreground" />
                  <span className="h-[3px] shrink-0 bg-foreground" />
                </>
              )}
              <span className={cn("flex-1", index === peak ? "bg-foreground" : "bg-primary")} />
            </div>
          </div>
        ))}
      </div>
      <figcaption
        aria-hidden="true"
        className={cn("flex text-xs text-muted-foreground", dense ? "gap-1" : "gap-2.5")}
      >
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className={cn(
              "flex-1 text-center whitespace-nowrap",
              index === peak && "font-semibold text-foreground",
              dense && index % 5 !== values.length % 5 && "invisible",
            )}
          >
            {label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
