import { cn } from "cn"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import type * as React from "react"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group/row border-b border-border/70 transition-colors hover:bg-muted/40",
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 px-5 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("h-16 px-5 align-middle whitespace-nowrap", className)} {...props} />
}

// The actions column stays at the right edge while the other columns scroll under it. It paints an
// opaque fill, so the row's hover tint is mixed into it rather than layered on top. Collapsed table
// borders do not travel with a sticky cell, so its left edge is a pseudo-element.
const pinned =
  "sticky right-0 bg-background before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border/70 group-hover/row:bg-[color-mix(in_oklab,var(--background),var(--muted)_40%)]"

function TablePinnedHead({ className, ...props }: React.ComponentProps<"th">) {
  return <TableHead className={cn(pinned, "group-hover/row:bg-background", className)} {...props} />
}

function TablePinnedCell({ className, ...props }: React.ComponentProps<"td">) {
  return <TableCell className={cn(pinned, "px-3", className)} {...props} />
}

type SortDirection = "asc" | "desc"

// A column header that sorts by its column. The first click applies `firstDirection`, and each
// click after that flips it. An idle header only shows its arrow on hover.
function TableSortHead({
  direction,
  firstDirection = "asc",
  onSort,
  alignEnd = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"th">, "onClick"> & {
  direction: SortDirection | null
  firstDirection?: SortDirection
  onSort: (direction: SortDirection) => void
  alignEnd?: boolean
}) {
  const Arrow = (direction ?? firstDirection) === "asc" ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
      className={cn(alignEnd && "text-right", className)}
      {...props}
    >
      <button
        type="button"
        onClick={() =>
          onSort(direction === null ? firstDirection : direction === "asc" ? "desc" : "asc")
        }
        className={cn(
          "group/sort -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
          direction && "text-foreground",
          alignEnd && "flex-row-reverse",
        )}
      >
        {children}
        <Arrow
          aria-hidden="true"
          className={cn(
            "size-3 transition-opacity",
            direction
              ? "opacity-100"
              : "opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60",
          )}
        />
      </button>
    </TableHead>
  )
}

export {
  type SortDirection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
  TableSortHead,
}
