"use client"

import { Slider } from "@base-ui/react/slider"
import { cn } from "cn"
import type * as React from "react"

// A slider that snaps between a few named stops, such as Expires after: 1h, 1d, 1w, 1mo, Never.
// The chosen stop's name sits above the track, the track fills blue up to the thumb, and a dot
// marks every stop. Arrow keys move one stop at a time.
function StepSlider<Value extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: {
  value: Value
  onValueChange: (value: Value) => void
  options: { value: Value; label: string; valueLabel?: React.ReactNode }[]
  className?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  disabled?: boolean
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const last = options.length - 1
  const current = options[index]

  return (
    <Slider.Root
      value={index}
      min={0}
      max={last}
      step={1}
      thumbAlignment="edge"
      onValueChange={(next) => {
        const option = options[next as number]
        if (option && option.value !== value) onValueChange(option.value)
      }}
      className={cn("flex flex-col gap-2", className)}
      disabled={props.disabled}
    >
      <span aria-hidden="true" className="text-center text-sm font-medium text-link">
        {current?.valueLabel ?? current?.label}
      </span>
      <Slider.Control className="flex touch-none items-center select-none data-disabled:opacity-50">
        <Slider.Track className="relative h-8 w-full rounded-lg bg-muted">
          <Slider.Indicator className="rounded-l-lg bg-primary" />
          {options.map((option, stop) => (
            <span
              key={option.value}
              aria-hidden="true"
              // The thumb is 32px wide and stays inside the track, so stops run from 16px in on
              // each side.
              style={{ left: `calc(16px + (100% - 32px) * ${last === 0 ? 0 : stop / last})` }}
              className={cn(
                "pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                stop < index ? "bg-primary-foreground/70" : "bg-muted-foreground/50",
              )}
            />
          ))}
          <Slider.Thumb
            aria-label={props["aria-label"]}
            aria-labelledby={props["aria-labelledby"]}
            getAriaValueText={(_, stop) => options[stop]?.label ?? ""}
            className="size-8 rounded-lg border border-border bg-background shadow-[0_1px_3px_rgb(0_0_0/0.18)] outline-none transition-[left] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring/30 data-dragging:transition-none motion-reduce:transition-none dark:bg-foreground"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  )
}

export { StepSlider }
