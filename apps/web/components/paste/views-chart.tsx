import { cn } from "@sniptide/ui/lib/utils"
import { DitherBar } from "@/components/charts/dither-bar"

// Dithered bar sparkline with today in pink.
export function ViewsSparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values)

  return (
    <div aria-hidden="true" className={cn("flex h-11 items-end gap-1", className)}>
      {values.map((value, index) => (
        <DitherBar
          key={index}
          style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
          className="min-w-0 flex-1"
          highlight={index === values.length - 1}
        />
      ))}
    </div>
  )
}
