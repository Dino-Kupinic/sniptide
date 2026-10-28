"use client"

import { cn } from "@sniptide/ui/lib/utils"
import * as React from "react"
import { isLargeEditorContent } from "@/lib/highlight/editor-limits"
import type { HighlightedLines } from "@/lib/highlight/types"
import { renderToken } from "./code-block"

type TextareaProps = Omit<React.ComponentProps<"textarea">, "value"> & { value: string }

// A textarea with syntax colours. The text you see is a coloured copy laid under the textarea,
// whose own text is transparent but still carries the caret, selection and input. Both must
// share font, size, line height and wrapping, so those go in `metricsClassName`; scrolling is
// copied across. `lines` come from useHighlight and match `value` line for line; without them
// (loading or plain text) the copy is plain. Oversized files use the visible textarea directly.
// `activeLine` (1-based) gets a quiet row behind it while the textarea has focus.
export function HighlightedTextarea({
  value,
  lines,
  activeLine,
  plain,
  metricsClassName,
  className,
  onScroll,
  ...props
}: TextareaProps & {
  lines?: HighlightedLines
  activeLine?: number
  plain?: boolean
  metricsClassName?: string
}) {
  const layer = React.useRef<HTMLDivElement>(null)
  const oversized = React.useMemo(() => plain ?? isLargeEditorContent(value), [plain, value])

  return (
    <div className={cn("group/textarea relative min-w-0 flex-1", oversized && "flex")}>
      {!oversized && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div ref={layer} className={cn("w-max min-w-full whitespace-pre", metricsClassName)}>
            {(lines ?? value.split("\n").map((line) => (line ? [line] : []))).map((line, index) => (
              <div
                key={index}
                className={cn(
                  index + 1 === activeLine &&
                    "rounded-sm group-focus-within/textarea:bg-border/60 dark:group-focus-within/textarea:bg-muted",
                )}
              >
                {line.length ? line.map(renderToken) : " "}
              </div>
            ))}
          </div>
        </div>
      )}
      <textarea
        key="editor"
        {...props}
        value={value}
        onScroll={(event) => {
          const { scrollLeft, scrollTop } = event.currentTarget
          if (layer.current)
            layer.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`
          onScroll?.(event)
        }}
        className={cn(
          "relative block w-full resize-none bg-transparent whitespace-pre caret-highlight outline-none selection:bg-primary/25 placeholder:text-muted-foreground",
          oversized ? "text-foreground" : "text-transparent",
          metricsClassName,
          className,
        )}
      />
    </div>
  )
}
