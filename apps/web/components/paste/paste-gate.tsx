import type * as React from "react"

// The card a share link shows before its paste: the password prompt and the burn-after-read
// confirmation. It reads like a dialog (20px title, 24px padding, the dialog shadow) and ends in a
// strip naming the link, so a reader with several tabs open knows which paste is asking.
export function PasteGate({
  slug,
  icon,
  title,
  description,
  children,
}: {
  slug: string
  icon: React.ReactNode
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby="paste-gate-title"
      className="flex w-full max-w-[400px] flex-col self-center overflow-hidden rounded-lg border border-border bg-card shadow-(--dialog-shadow)"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <h1
            id="paste-gate-title"
            className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]"
          >
            {title}
          </h1>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">{description}</div>
        </div>
        {children}
      </div>
      <p className="flex min-w-0 items-center gap-2 border-t border-border bg-sidebar px-6 py-3 text-[13px] text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        <span className="min-w-0 truncate font-mono">/{slug}</span>
      </p>
    </section>
  )
}
