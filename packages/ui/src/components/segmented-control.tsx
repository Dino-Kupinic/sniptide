"use client"

import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { cn } from "cn"

// Single-choice control from the Paper designs (Visibility: Private / Unlisted / Public).
// A radio group underneath, so arrow keys move between options.
function SegmentedControl<Value extends string>({
  value,
  onValueChange,
  options,
  className,
  itemClassName,
  ...props
}: {
  value: Value
  onValueChange: (value: Value) => void
  options: { value: Value; label: React.ReactNode }[]
  className?: string
  itemClassName?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  disabled?: boolean
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as Value)}
      className={cn("flex gap-0.5 bg-muted p-[3px]", className)}
      {...props}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            "flex-1 py-[5px] text-center text-[13px] leading-[18px] text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-checked:bg-background data-checked:font-medium data-checked:text-foreground data-checked:shadow-[0_1px_2px_rgb(0_0_0/0.08)] data-disabled:opacity-50",
            itemClassName,
          )}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

export { SegmentedControl }
