import { cn } from "@sniptide/ui/lib/utils"
import type { CSSProperties } from "react"
import { ditherSettings } from "@/lib/dither/settings"
import { fillStyle } from "@/lib/dither/style"

// Hatched dithercn fill with a solid leading edge. Labels live outside the masked layer.
export function DitherBar({
  highlight = false,
  active = false,
  className,
  style,
}: {
  highlight?: boolean
  active?: boolean
  className?: string
  style?: CSSProperties
}) {
  const color = highlight ? "--highlight" : "--chart-1"
  return (
    <span aria-hidden="true" className={cn("relative block w-full", className)} style={style}>
      <span
        className="absolute inset-0"
        style={{
          ...fillStyle(ditherSettings.fill, { color, cell: ditherSettings.cell }),
          opacity: active ? 1 : 0.8,
        }}
      />
      <span
        className="absolute inset-x-0 top-0"
        style={{ height: ditherSettings.cell, backgroundColor: `var(${color})` }}
      />
    </span>
  )
}
