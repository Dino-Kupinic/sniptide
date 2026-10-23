"use client"

import { cn } from "cn"
import * as React from "react"

// Opens and closes a block by animating its height (a grid row from 0fr to 1fr) and fading it.
// The content mounts the first time it opens and then stays, so closing can animate and nothing
// loads before it is wanted. While closed it is inert, so it takes no focus. Under reduced motion
// it opens and closes at once.
function Reveal({
  open,
  id,
  className,
  children,
}: {
  open: boolean
  id?: string
  className?: string
  children: React.ReactNode
}) {
  const [mounted, setMounted] = React.useState(open)
  // Trails `open` by a frame on first mount, so the opening animates instead of jumping.
  const [expanded, setExpanded] = React.useState(open)

  React.useEffect(() => {
    if (!open) {
      setExpanded(false)
      return
    }
    setMounted(true)
    const frame = requestAnimationFrame(() => setExpanded(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        {mounted ? <div className={className}>{children}</div> : null}
      </div>
    </div>
  )
}

export { Reveal }
