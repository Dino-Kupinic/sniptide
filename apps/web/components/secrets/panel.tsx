import type { ReactNode } from "react"

// A titled, bordered section of a secret group page.
export function Panel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border">
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}
