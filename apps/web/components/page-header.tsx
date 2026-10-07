import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl leading-9 font-bold tracking-[-0.02em] uppercase lg:text-4xl lg:leading-10">
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-7">
      <PageHeader title={title} />
      <div className="flex min-h-64 items-center justify-center border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {description}
      </div>
    </div>
  )
}
