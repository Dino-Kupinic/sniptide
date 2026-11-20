import { cn } from "@sniptide/ui/lib/utils"
import type * as React from "react"

export function PageHeader({
  title,
  description,
  actions,
  className,
  phoneTitleOnly = false,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  // Below lg, shows only the title, as a large iOS title, and leaves the rest to the page.
  phoneTitleOnly?: boolean
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h1
          className={cn(
            "font-heading text-3xl leading-9 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10",
            phoneTitleOnly && "max-lg:text-[34px] max-lg:leading-[41px]",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className={cn("text-sm text-muted-foreground", phoneTitleOnly && "max-lg:hidden")}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className={cn("flex items-center gap-2", phoneTitleOnly && "max-lg:hidden")}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}
