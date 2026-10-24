"use client"

import { Button } from "@sniptide/ui/components/button"
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
import { useLocale, useTranslations } from "next-intl"
import type * as React from "react"
import { HeaderActions, HeaderTitle } from "@/components/shell/page-header"
import { TruncatedText } from "@/components/truncated-text"
import { formatNumber } from "@/lib/format"

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const t = useTranslations("Workspace")
  const searchPlaceholder = placeholder ?? t("filter_by_title_or_slug")
  return (
    <label
      className={cn(
        "rounded-lg flex h-[46px] items-center gap-2.5 border border-border px-3 focus-within:border-primary lg:h-8 lg:w-65 lg:gap-2 lg:px-2.5",
        className,
      )}
    >
      <SearchIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground lg:size-3.5"
      />
      <input
        type="search"
        aria-label={searchPlaceholder.replace("…", "")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={searchPlaceholder}
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground lg:text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label={t("clear_filter")}
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
  const t = useTranslations("Workspace")
  const active = selected.length > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "rounded-md flex h-8 items-center gap-1.5 border border-dashed border-input px-2.5 text-[13px] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground/40",
          active && "border-solid border-foreground",
        )}
      >
        <PlusCircleIcon
          aria-hidden="true"
          className={cn("size-[13px] text-foreground/75", active && "hidden")}
        />
        {label}
        {active ? (
          <span className="rounded-sm bg-foreground px-1.5 text-xs font-medium text-background tabular-nums">
            {selected.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-52">
        {options.length === 0 ? (
          <p className="px-3 py-1.5 text-sm text-muted-foreground">{t("nothing_to_filter")}</p>
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
              {t("clear_filter")}
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
      <DropdownMenuTrigger className="rounded-md flex h-8 items-center gap-1.5 border border-border px-2.5 text-[13px] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground/40">
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
            "rounded-md h-[34px] shrink-0 border border-border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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
  const t = useTranslations("Workspace")
  return (
    <div
      role="radiogroup"
      aria-label={t("layout")}
      className="flex gap-0.5 rounded-lg bg-muted p-[3px]"
    >
      {(
        [
          { value: "list", label: t("list"), icon: ListIcon },
          { value: "grid", label: t("grid"), icon: LayoutGridIcon },
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
            "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
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
  const t = useTranslations("Workspace")
  if (pageCount <= 1) return null

  // First, last, and the current page with its neighbours; gaps become an ellipsis.
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((candidate) => candidate >= 1 && candidate <= pageCount)
    .sort((a, b) => a - b)

  return (
    <nav
      aria-label={t("pagination")}
      className="flex shrink-0 flex-wrap items-center gap-1.5 text-[13px]"
    >
      <Button
        variant="outline"
        size="icon"
        aria-label={t("previous_page")}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeftIcon className="size-3.5" />
      </Button>
      {pages.map((candidate, index) => (
        <span
          key={candidate}
          className={cn("hidden items-center gap-1 sm:flex", candidate === page && "flex")}
        >
          {index > 0 && candidate - (pages[index - 1] ?? candidate) > 1 ? (
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center text-muted-foreground"
            >
              …
            </span>
          ) : null}
          <Button
            variant={candidate === page ? "inverted" : "outline"}
            size="icon"
            aria-current={candidate === page ? "page" : undefined}
            onClick={() => onChange(candidate)}
            className="text-[13px] tabular-nums"
          >
            {candidate}
          </Button>
        </span>
      ))}
      <Button
        variant="outline"
        size="icon"
        aria-label={t("next_page")}
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
    </nav>
  )
}

// Page title row: big uppercase title with the count beside it on mobile. On desktop the title
// and count also name the top bar, and the page's actions move up into it.
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
  const locale = useLocale()
  return (
    <div className="flex flex-col gap-1">
      <HeaderTitle>
        <TruncatedText className="max-w-80">{title}</TruncatedText>
        {count !== undefined ? (
          <span className="rounded-sm shrink-0 bg-muted px-1.5 py-px text-xs font-normal text-muted-foreground tabular-nums">
            {formatNumber(count, locale)}
          </span>
        ) : null}
      </HeaderTitle>
      {actions ? <HeaderActions>{actions}</HeaderActions> : null}
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="min-w-0 [overflow-wrap:anywhere] font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10">
          {title}
        </h1>
        {count !== undefined ? (
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums lg:hidden">
            {formatNumber(count, locale)}
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="hidden text-sm text-muted-foreground lg:block">{description}</p>
      ) : null}
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
