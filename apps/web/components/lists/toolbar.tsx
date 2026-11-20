"use client"

import { Button } from "@sniptide/ui/components/button"
import { Checkbox } from "@sniptide/ui/components/checkbox"
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTrigger,
  sheetRowClass,
} from "@sniptide/ui/components/sheet"
import { Skeleton } from "@sniptide/ui/components/skeleton"
import { Spinner } from "@sniptide/ui/components/spinner"
import { cn } from "@sniptide/ui/lib/utils"
import {
  CheckIcon,
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
import * as React from "react"
import { HeaderActions, HeaderTitle } from "@/components/shell/page-header"
import { TruncatedText } from "@/components/truncated-text"
import { formatNumber } from "@/lib/format"

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
  pending = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  pending?: boolean
}) {
  const t = useTranslations("Workspace")
  const searchPlaceholder = placeholder ?? t("filter_by_title_or_slug")
  return (
    <label
      aria-busy={pending}
      className={cn(
        "rounded-lg flex h-10 items-center gap-2 bg-muted px-2.5 focus-within:ring-2 focus-within:ring-ring/40 lg:h-8 lg:w-65 lg:border lg:border-border lg:bg-transparent lg:focus-within:border-primary lg:focus-within:ring-0",
        className,
      )}
    >
      <SearchIcon
        aria-hidden="true"
        className="size-[18px] shrink-0 text-muted-foreground lg:size-3.5"
      />
      <input
        type="search"
        aria-label={searchPlaceholder.replace("…", "")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={searchPlaceholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground lg:text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      {pending ? (
        <span role="status" className="loading-feedback shrink-0 text-muted-foreground">
          <Spinner className="size-3.5" />
          <span className="sr-only">{t("loading")}</span>
        </span>
      ) : null}
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
          <span className="absolute top-0.5 right-0.5 min-w-4 rounded-sm bg-primary px-1 text-[11px] leading-4 font-medium text-primary-foreground tabular-nums">
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

export interface FilterGroup {
  id: string
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
}

// The sheet's option rows: 48px sheet rows at regular weight, with their own icon colors (the
// blue check of the chosen sort, the checkbox's own check).
const sheetOptionClass = cn(sheetRowClass, "font-normal")

// The phone's way to the desktop's Sort menu and filter chips: a button at the end of the chip
// row that opens a bottom sheet with the same options. Every pick navigates at once, like the
// desktop menus, so the sheet's button can show how many pastes the filters leave.
export function MobileFilterSheet<Sort extends string>({
  sort,
  filters,
  total,
  pending = false,
  onClear,
}: {
  sort?: {
    value: Sort
    defaultValue: Sort
    options: { value: Sort; label: string }[]
    onChange: (value: Sort) => void
  }
  filters: FilterGroup[]
  total: number
  pending?: boolean
  // Resets the sort and every filter in the sheet in one navigation.
  onClear: () => void
}) {
  const t = useTranslations("Workspace")
  const locale = useLocale()
  const id = React.useId()
  const [open, setOpen] = React.useState(false)
  const groups = filters.filter((group) => group.options.length > 0)
  const active =
    groups.reduce((count, group) => count + group.selected.length, 0) +
    (sort && sort.value !== sort.defaultValue ? 1 : 0)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={
              active > 0 ? t("sort_and_filter_active", { count: active }) : t("sort_and_filter")
            }
            className="relative size-10 shrink-0 text-link [&_svg:not([class*='size-'])]:size-[22px]"
          />
        }
      >
        <ListFilterIcon aria-hidden="true" strokeWidth={1.9} />
        {active > 0 ? (
          <span className="rounded-sm bg-foreground px-1.5 text-xs font-medium text-background tabular-nums">
            {formatNumber(active, locale)}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader title={t("sort_and_filter")} closeLabel={t("close")} />
        <SheetBody className="flex flex-col gap-4">
          {sort ? (
            <section aria-labelledby={`${id}-sort`} className="flex flex-col">
              <h3 id={`${id}-sort`} className="px-3 py-2 text-sm font-semibold">
                {t("sort_by")}
              </h3>
              <div role="radiogroup" aria-labelledby={`${id}-sort`} className="flex flex-col">
                {sort.options.map((option) => (
                  // biome-ignore lint/a11y/useSemanticElements: full-width rows acting as a radio group
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={sort.value === option.value}
                    onClick={() => sort.onChange(option.value)}
                    className={cn(sheetOptionClass, "justify-between [&_svg]:text-link")}
                  >
                    {option.label}
                    {sort.value === option.value ? (
                      <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-link" />
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`${id}-${group.id}`} className="flex flex-col">
              <h3 id={`${id}-${group.id}`} className="px-3 py-2 text-sm font-semibold">
                {group.label}
              </h3>
              {group.options.map((option) => (
                // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox inside is the control
                <label
                  key={option.value}
                  className={cn(sheetOptionClass, "[&_svg]:size-3 [&_svg]:text-primary-foreground")}
                >
                  <Checkbox
                    checked={group.selected.includes(option.value)}
                    onCheckedChange={(checked) =>
                      group.onChange(
                        checked
                          ? [...group.selected, option.value]
                          : group.selected.filter((value) => value !== option.value),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </label>
              ))}
            </section>
          ))}
        </SheetBody>
        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="xl"
            disabled={active === 0}
            onClick={onClear}
            className="flex-1"
          >
            {t("clear_all")}
          </Button>
          <Button size="xl" loading={pending} onClick={() => setOpen(false)} className="flex-1">
            {t("show_results", { count: total })}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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

// Page title row: the title with its count beside it. On desktop the title and count also name
// the top bar, and the page's actions move up into it. Phones have no top bar slot, so the
// actions sit at the end of the title row instead: `mobileActions` when the page has a compact
// version of them, otherwise `actions` as they are.
export function ListHeader({
  title,
  count,
  description,
  actions,
  mobileActions = actions,
  headerActions = actions,
  topBar = true,
}: {
  // False while the list loads: the top bar keeps the title it already shows for the route.
  topBar?: boolean
  // Empty while the title is still loading, which holds its place with a placeholder.
  title: string
  count?: number
  description?: React.ReactNode
  actions?: React.ReactNode
  mobileActions?: React.ReactNode
  headerActions?: React.ReactNode
}) {
  const locale = useLocale()
  return (
    <div className="flex flex-col gap-1">
      {topBar ? (
        <HeaderTitle>
          {title ? (
            <TruncatedText className="max-w-80">{title}</TruncatedText>
          ) : (
            <Skeleton className="h-3.5 w-32" />
          )}
          {count !== undefined ? (
            <span className="rounded-sm shrink-0 bg-muted px-1.5 py-px text-xs font-normal text-muted-foreground tabular-nums">
              {formatNumber(count, locale)}
            </span>
          ) : null}
        </HeaderTitle>
      ) : null}
      {headerActions ? <HeaderActions>{headerActions}</HeaderActions> : null}
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="min-w-0 [overflow-wrap:anywhere] font-heading text-[34px] leading-[41px] font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10">
            {title || <Skeleton className="my-1.5 h-6 w-56 lg:my-2" />}
          </h1>
        </div>
        {mobileActions ? (
          <div className="-mr-2 flex shrink-0 items-center gap-1 lg:hidden">{mobileActions}</div>
        ) : null}
      </div>
      {description ? (
        <p className="hidden text-sm text-muted-foreground lg:block">{description}</p>
      ) : null}
    </div>
  )
}
