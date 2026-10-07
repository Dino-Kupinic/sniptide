import { cn } from "cn"
import type * as React from "react"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-0.5 bg-muted px-1 font-mono text-[11px] text-muted-foreground in-data-[slot=button]:bg-white/15 in-data-[slot=button]:text-current",
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
