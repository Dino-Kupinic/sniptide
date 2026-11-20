import { cn } from "@sniptide/ui/lib/utils"
import { ChevronRightIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import type * as React from "react"

// Marks a phone screen as grouped: the shell turns its canvas grey below lg, so the white panels
// stand out the way an iOS grouped table does. Desktop keeps its usual background.
export function GroupedCanvas() {
  return <span data-grouped hidden />
}

// A panel of grouped rows on its own, for screens that lay out their rows by hand. Rows divide
// with an inset hairline that starts at the panel's padding, like `groupedSettingRowClass` does.
export const groupedPanelClass = "flex flex-col overflow-hidden rounded-lg bg-card"

// A row of label and control with no icon, such as a switch: 50px tall at the 17px iOS body size.
export const groupedSettingRowClass =
  "flex min-h-[50px] items-center gap-3 pr-4 text-[17px] leading-[22px] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"

// The label above a group: 13px in the secondary color, inset to line up with the rows.
export const groupedLabelClass = "px-4 text-[13px] leading-4 text-muted-foreground"

// iOS-style grouped lists for phone screens: rows on one white panel, divided by inset hairlines,
// under an optional muted label with an action at its end.
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
    <section aria-label={label} className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <div className="flex min-h-5 items-center justify-between gap-3 px-4">
          <h2 className="min-w-0 truncate text-[13px] leading-4 text-muted-foreground">{label}</h2>
          {action}
        </div>
      ) : null}
      <ul className="overflow-hidden rounded-lg bg-card">{children}</ul>
      {footer ? (
        <p className="px-4 pt-0.5 text-[13px] leading-[18px] text-muted-foreground">{footer}</p>
      ) : null}
    </section>
  )
}

export const groupedRowClass =
  "group/row flex min-h-[50px] w-full items-center gap-3 pl-4 text-left text-[17px] leading-[22px] outline-none hover:bg-muted focus-visible:bg-muted active:bg-muted"

// The row's label, value and chevron sit right of its icon, above the inset divider. The divider
// belongs to the body so it starts where the label does.
export const groupedRowBodyClass =
  "flex min-h-[50px] min-w-0 flex-1 items-center gap-2 self-stretch pr-4 group-not-last/item:border-b group-not-last/item:border-border"

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
      {chevron ? <GroupedChevron /> : null}
    </span>
  )
}

// The chevron at the end of a row that leads somewhere.
export function GroupedChevron() {
  return (
    <ChevronRightIcon
      aria-hidden
      className="-mr-1 size-5 shrink-0 text-muted-foreground/60"
      strokeWidth={2}
    />
  )
}

export function GroupedRowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className="size-[22px] shrink-0 text-link" strokeWidth={1.75} />
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
