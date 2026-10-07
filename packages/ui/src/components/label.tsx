import { cn } from "cn"
import type * as React from "react"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: consumers pass htmlFor or nest the control
    <label
      data-slot="label"
      className={cn("text-[13px] leading-[18px] font-medium text-foreground", className)}
      {...props}
    />
  )
}

export { Label }
