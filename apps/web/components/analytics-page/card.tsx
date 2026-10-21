import { cn } from "@sniptide/ui/lib/utils"
import type * as React from "react"

// A bordered panel with a title-only header, as on the Analytics artboards. `action` sits at the
// right of the header ("View all").
export function Card({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const id = `card-${title.toLowerCase().replaceAll(/\W+/g, "-")}`

  return (
    <section
      aria-labelledby={id}
      className={cn(
        "overflow-hidden rounded-lg flex min-w-0 flex-col border border-border",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-3 pr-3 pl-4">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// Horizontal bar on a track: `value` is 0 to 1. Decorative; the number next to it says it in text.
export function Meter({
  value,
  tone = "link",
  className,
}: {
  value: number
  tone?: "link" | "muted"
  className?: string
}) {
  return (
    <div aria-hidden="true" className={cn("flex h-1.5 shrink-0 bg-border", className)}>
      <div
        className={cn("h-full", tone === "link" ? "bg-link" : "bg-muted-foreground/40")}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  )
}
