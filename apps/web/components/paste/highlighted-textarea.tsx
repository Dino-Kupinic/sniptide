"use client"

import { cn } from "@sniptide/ui/lib/utils"
import * as React from "react"
import type { HighlightedLines } from "@/lib/highlight/types"
import { renderToken } from "./code-block"

type TextareaProps = Omit<React.ComponentProps<"textarea">, "value"> & { value: string }

// A textarea with syntax colours. The text you see is a coloured copy laid under the textarea,
// whose own text is transparent but still carries the caret, selection and input. Both must
// share font, size, line height and wrapping, so those go in `metricsClassName`; scrolling is
// copied across. `lines` come from useHighlight and match `value` line for line; without them
// (loading, plain text, a very large file) the copy is plain.
export function HighlightedTextarea({
  value,
  lines,
  metricsClassName,
  className,
  onScroll,
  ...props
}: TextareaProps & {
  lines?: HighlightedLines
  metricsClassName?: string
}) {
  const layer = React.useRef<HTMLDivElement>(null)

  return (
    <div className="relative min-w-0 flex-1">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={layer} className={cn("w-max min-w-full whitespace-pre", metricsClassName)}>
          {(lines ?? value.split("\n").map((line) => (line ? [line] : []))).map((line, index) => (
            <div key={index}>{line.length ? line.map(renderToken) : " "}</div>
          ))}
        </div>
      </div>
      <textarea
        {...props}
        value={value}
        onScroll={(event) => {
          const { scrollLeft, scrollTop } = event.currentTarget
          if (layer.current)
            layer.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`
          onScroll?.(event)
        }}
        className={cn(
          "relative block w-full resize-none bg-transparent whitespace-pre text-transparent caret-primary outline-none selection:bg-primary/25 placeholder:text-muted-foreground",
          metricsClassName,
          className,
        )}
      />
    </div>
  )
}
