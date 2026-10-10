import { cn } from "@sniptide/ui/lib/utils"

// Bar sparkline from the paste detail "Views" card: blue bars with today in ink.
export function ViewsSparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values)

  return (
    <div aria-hidden="true" className={cn("flex h-11 items-end gap-1", className)}>
      {values.map((value, index) => (
        <span
          key={index}
          style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
          className={cn("flex-1", index === values.length - 1 ? "bg-foreground" : "bg-link")}
        />
      ))}
    </div>
  )
}
