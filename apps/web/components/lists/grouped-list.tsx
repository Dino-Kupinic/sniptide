import { cn } from "@sniptide/ui/lib/utils"
import { ChevronRightIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import type * as React from "react"

// iOS-style grouped lists for phone screens: rows on one hairline-bordered panel, divided by
// inset hairlines, under an optional muted label with an action at its end.
export function GroupedList({
  label,
  action,
  footer,
  className,
  children,
}: {
  label?: string
  action?: React.ReactNode
  // A note under the panel, such as what a group's setting does.
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={label} className={cn("flex flex-col gap-2", className)}>
      {label ? (
        <div className="flex min-h-6 items-center justify-between gap-3 px-4">
          <h2 className="min-w-0 truncate text-[13px] leading-[18px] text-muted-foreground">
            {label}
          </h2>
          {action}
        </div>
      ) : null}
      <ul className="overflow-hidden rounded-lg border border-border bg-background">{children}</ul>
      {footer ? (
        <p className="px-4 text-[13px] leading-[18px] text-muted-foreground">{footer}</p>
      ) : null}
    </section>
  )
}

export const groupedRowClass =
  "group/row flex min-h-12 w-full items-center gap-3 pl-4 text-left text-[15px] leading-5 outline-none hover:bg-muted focus-visible:bg-muted active:bg-muted"

// The row's label, value and chevron sit right of its icon, above the inset divider. The divider
// belongs to the body so it starts where the label does.
export const groupedRowBodyClass =
  "flex min-h-12 min-w-0 flex-1 items-center gap-2 self-stretch pr-3 group-not-last/item:border-b group-not-last/item:border-border"

export function GroupedRowBody({
  label,
  value,
  chevron = true,
  labelClassName,
}: {
  label: React.ReactNode
  value?: React.ReactNode
  chevron?: boolean
  labelClassName?: string
}) {
  return (
    <span className={groupedRowBodyClass}>
      <span className={cn("min-w-0 flex-1 truncate", labelClassName)}>{label}</span>
      {value !== undefined && value !== null ? (
        <span className="shrink-0 text-muted-foreground tabular-nums">{value}</span>
      ) : null}
      {chevron ? (
        <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </span>
  )
}

export function GroupedRowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className="size-5 shrink-0 text-link" strokeWidth={1.75} />
}

// A row that leads to a page. `external` renders a plain anchor for links outside the app.
export function GroupedLinkRow({
  href,
  label,
  icon,
  value,
  external = false,
  onClick,
  labelClassName,
}: {
  href: string
  label: React.ReactNode
  icon?: LucideIcon
  value?: React.ReactNode
  external?: boolean
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
  labelClassName?: string
}) {
  const content = (
    <>
      {icon ? <GroupedRowIcon icon={icon} /> : null}
      <GroupedRowBody label={label} value={value} labelClassName={labelClassName} />
    </>
  )
  return (
    <li className="group/item">
      {external ? (
        <a href={href} onClick={onClick} className={groupedRowClass}>
          {content}
        </a>
      ) : (
        <Link href={href} onClick={onClick} className={groupedRowClass}>
          {content}
        </Link>
      )}
    </li>
  )
}
