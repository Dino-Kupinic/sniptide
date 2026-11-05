import { cn } from "@sniptide/ui/lib/utils"
import type { CSSProperties } from "react"
import { fillStyle } from "@/lib/dither/style"

// Static dithercn fill with a solid leading edge. Labels live outside the masked layer.
export function DitherBar({
  highlight = false,
  active = false,
  compact = false,
  className,
  style,
}: {
  highlight?: boolean
  active?: boolean
  compact?: boolean
  className?: string
  style?: CSSProperties
}) {
  const color = highlight ? "--highlight" : "--chart-1"
  return (
    <span aria-hidden="true" className={cn("relative block w-full", className)} style={style}>
      <span
        className="absolute inset-0"
        style={fillStyle("gradient", {
          color,
          cell: compact ? 1 : 2,
          edge: "top",
          length: compact ? 44 : 96,
          from: active || highlight ? 1 : 0.75,
          to: active ? 0.5 : 0.125,
        })}
      />
      <span
        className="absolute inset-x-0 top-0"
        style={{ height: compact ? 1 : 2, backgroundColor: `var(${color})` }}
      />
    </span>
  )
}
