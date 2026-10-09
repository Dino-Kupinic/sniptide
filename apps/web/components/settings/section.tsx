import type * as React from "react"

// Two-column settings row from the Paper Settings artboard: title and description on the left,
// controls on the right. Stacks on phones.
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border py-6 first:border-t-0 lg:flex-row lg:gap-10 lg:py-7">
      <div className="flex flex-col gap-1 lg:w-[288px] lg:shrink-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? (
          <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-5 lg:max-w-[560px]">{children}</div>
    </section>
  )
}

export function SettingRow({
  label,
  description,
  id,
  children,
}: {
  label: string
  description?: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        {description ? (
          <span className="text-[13px] text-muted-foreground">{description}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function SaveStatus({ status }: { status: { ok: boolean; message: string } | null }) {
  if (!status) return null
  return (
    <p
      role={status.ok ? "status" : "alert"}
      className={status.ok ? "text-[13px] text-link" : "text-[13px] text-destructive"}
    >
      {status.message}
    </p>
  )
}
