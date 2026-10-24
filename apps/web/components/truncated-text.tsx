"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { cn } from "@sniptide/ui/lib/utils"
import * as React from "react"

// One line of text cut off with an ellipsis. Hovering shows the whole text in a tooltip, but only
// while it is actually cut off, so short titles don't repeat themselves.
export function TruncatedText({ children, className }: { children: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = React.useState(false)

  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [children])

  return (
    <Tooltip disabled={!truncated}>
      <TooltipTrigger
        render={<span ref={ref} />}
        className={cn("block min-w-0 truncate", className)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-96 font-sans break-words">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
