import { Skeleton } from "@sniptide/ui/components/skeleton"
import { TableCell, TablePinnedCell, TableRow } from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"

// Text of varying length reads as a list. The widths repeat every five rows.
const titleWidths = ["w-40", "w-64", "w-48", "w-56", "w-36"]

// Rows for a list table that is still loading. They sit in the table's own columns, so the
// loaded rows land where these were. `cells` gives each column after the title a width class, or
// null for a column that stays empty.
export function SkeletonTableRows({
  rows,
  cells,
  rowClassName,
  detail = false,
  icon = false,
}: {
  // An icon before the title, such as a collection's.
  icon?: boolean
  rows: number
  cells: (string | null)[]
  rowClassName?: string
  // A second line under the title, such as the paste's link.
  detail?: boolean
}) {
  return Array.from({ length: rows }, (_, row) => (
    <TableRow key={row} aria-hidden="true" className={cn("hover:bg-transparent", rowClassName)}>
      <TableCell className="w-12 pr-0">
        <Skeleton className="size-4 rounded-sm" />
      </TableCell>
      <TableCell className="pl-0">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? <Skeleton className="size-4 shrink-0" /> : null}
          <Skeleton className={cn("h-3.5 max-w-full", titleWidths[row % titleWidths.length])} />
        </div>
        {detail ? <Skeleton className="mt-1.5 h-3 w-32 max-w-full" /> : null}
      </TableCell>
      {cells.map((width, index) => (
        <TableCell key={index}>
          {width ? <Skeleton className={cn("h-3.5 max-w-full", width)} /> : null}
        </TableCell>
      ))}
      <TablePinnedCell />
    </TableRow>
  ))
}

// The phone list's rows: an icon, a title and one line of details.
export function SkeletonMobileRows({ rows }: { rows: number }) {
  return (
    <ul aria-hidden="true" className="-mx-4 flex flex-col lg:hidden">
      {Array.from({ length: rows }, (_, row) => (
        <li key={row} className="group/item flex min-h-[68px] items-center gap-3.5 pl-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch border-b border-border pr-4 group-last/item:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-3">
              <span className="flex h-[22px] items-center">
                <Skeleton className={cn("h-4 max-w-full", titleWidths[row % titleWidths.length])} />
              </span>
              <span className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-36 max-w-full" />
              </span>
            </div>
            <span className="size-5 shrink-0" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// The grid view's cards, at the size of a paste card.
export function SkeletonCards({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="hidden grid-cols-2 gap-4 xl:grid-cols-3 lg:grid">
      {Array.from({ length: count }, (_, card) => (
        <li
          key={card}
          className="flex h-64 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-sidebar px-5 pt-3.5"
        >
          <div className="flex h-7 items-center">
            <Skeleton className="h-3.5 w-36" />
          </div>
          <div className="mt-2.5 flex h-[60px] shrink-0 items-start pt-1.5">
            <Skeleton className={cn("h-5 max-w-full", titleWidths[card % titleWidths.length])} />
          </div>
          <div className="mt-3.5 flex min-h-0 flex-1 flex-col gap-2.5 rounded-t-lg border border-b-0 border-border bg-background px-3.5 pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// The line under a list: its summary, and the page buttons when the list runs past one page.
export function SkeletonListFooter({ paged }: { paged: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-center justify-between gap-3 py-3 lg:py-0"
    >
      <span className="flex h-[19.5px] items-center">
        <Skeleton className="h-3.5 w-36" />
      </span>
      {paged ? <Skeleton className="h-8 w-44 rounded-lg" /> : null}
    </div>
  )
}
