"use client"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  ListFilterIcon,
  ListIcon,
  PlusCircleIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import type * as React from "react"

export function SearchField({
  value,
  onChange,
  placeholder = "Filter by title or slug…",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex h-[46px] items-center gap-2.5 border border-border px-3 focus-within:border-primary lg:h-8 lg:w-65 lg:gap-2 lg:px-2.5",
        className,
      )}
    >
      <SearchIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground lg:size-3.5"
      />
      <input
        type="search"
        aria-label={placeholder.replace("…", "")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground lg:text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </label>
  )
}

export interface FilterOption {
  value: string
  label: React.ReactNode
}

// Dashed "+ Language" style chip that opens a multi-select. Shows the picked count when active.
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const active = selected.length > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 border border-dashed border-input px-2.5 text-[13px] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground",
          active && "border-solid border-foreground",
        )}
      >
        <PlusCircleIcon
          aria-hidden="true"
          className={cn("size-[13px] text-foreground/75", active && "hidden")}
        />
        {label}
        {active ? (
          <span className="bg-foreground px-1.5 text-xs font-medium text-background tabular-nums">
            {selected.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-52">
        {options.length === 0 ? (
          <p className="px-3 py-1.5 text-sm text-muted-foreground">Nothing to filter</p>
        ) : null}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...selected, option.value]
                  : selected.filter((value) => value !== option.value),
              )
            }
            closeOnClick={false}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])} className="text-muted-foreground">
              Clear filter
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SortMenu<Value extends string>({
  value,
  options,
  onChange,
}: {
  value: Value
  options: { value: Value; label: string }[]
  onChange: (value: Value) => void
}) {
  const current = options.find((option) => option.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 border border-border px-2.5 text-[13px] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground">
        <ListFilterIcon aria-hidden="true" className="size-3.5 text-foreground/75" />
        {current?.label}
        <ChevronDownIcon aria-hidden="true" className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as Value)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Mobile filter chips ("All · Public · Unlisted …"), a single-choice row that scrolls sideways.
export function QuickChips<Value extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: Value
  options: { value: Value; label: string }[]
  onChange: (value: Value) => void
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
    >
      {options.map((option) => (
        // biome-ignore lint/a11y/useSemanticElements: styled chips acting as a radio group
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-[34px] shrink-0 border border-border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            value === option.value && "border-foreground bg-foreground font-medium text-background",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ViewToggle({
  value,
  onChange,
}: {
  value: "list" | "grid"
  onChange: (value: "list" | "grid") => void
}) {
  return (
    <div role="radiogroup" aria-label="Layout" className="flex gap-0.5 bg-muted p-[3px]">
      {(
        [
          { value: "list", label: "List", icon: ListIcon },
          { value: "grid", label: "Grid", icon: LayoutGridIcon },
        ] as const
      ).map((option) => (
        // biome-ignore lint/a11y/useSemanticElements: icon toggle acting as a radio group
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex size-7 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
            value === option.value &&
              "bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
          )}
        >
          <option.icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  if (pageCount <= 1) return null

  // First, last, and the current page with its neighbours; gaps become an ellipsis.
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((candidate) => candidate >= 1 && candidate <= pageCount)
    .sort((a, b) => a - b)

  return (
    <nav aria-label="Pagination" className="flex items-center gap-1 text-[13px]">
      <button
        type="button"
        aria-label="Previous page"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className="flex size-8 items-center justify-center border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 disabled:text-muted-foreground/50 disabled:hover:bg-transparent"
      >
        <ChevronLeftIcon className="size-3.5" />
      </button>
      {pages.map((candidate, index) => (
        <span key={candidate} className="flex items-center gap-1">
          {index > 0 && candidate - (pages[index - 1] ?? candidate) > 1 ? (
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center text-muted-foreground"
            >
              …
            </span>
          ) : null}
          <button
            type="button"
            aria-current={candidate === page ? "page" : undefined}
            onClick={() => onChange(candidate)}
            className={cn(
              "flex size-8 items-center justify-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
              candidate === page && "bg-foreground font-medium text-background hover:bg-foreground",
            )}
          >
            {candidate}
          </button>
        </span>
      ))}
      <button
        type="button"
        aria-label="Next page"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
        className="flex size-8 items-center justify-center border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 disabled:text-muted-foreground/50 disabled:hover:bg-transparent"
      >
        <ChevronRightIcon className="size-3.5" />
      </button>
    </nav>
  )
}

// Page title row: big uppercase title with the count beside it on mobile, actions on desktop.
export function ListHeader({
  title,
  count,
  description,
  actions,
}: {
  title: string
  count?: number
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] uppercase lg:text-4xl lg:leading-10">
            {title}
          </h1>
          {count !== undefined ? (
            <span className="text-sm text-muted-foreground tabular-nums lg:hidden">{count}</span>
          ) : null}
        </div>
        {description ? (
          <p className="hidden text-sm text-muted-foreground lg:block">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="hidden items-center gap-2 lg:flex">{actions}</div> : null}
    </div>
  )
}

export function usePaged<T>(items: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * pageSize

  return {
    page: current,
    pageCount,
    items: items.slice(start, start + pageSize),
    range: items.length === 0 ? "0" : `${start + 1}–${Math.min(start + pageSize, items.length)}`,
  }
}
