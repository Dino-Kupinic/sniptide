"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { CheckIcon, MinusIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-primary-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary data-disabled:border-border data-disabled:bg-muted",
        className,
      )}
      {...props}
    >
      {/* A select-all box shows a dash while only some of its rows are checked. */}
      <CheckboxPrimitive.Indicator
        className="flex items-center justify-center"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <MinusIcon className="size-3" strokeWidth={3} />
            ) : (
              <CheckIcon className="size-3" strokeWidth={3} />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
