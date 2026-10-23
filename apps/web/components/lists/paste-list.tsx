"use client"

import { Badge } from "@sniptide/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FlameIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  StarIcon,
} from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { LanguageLabel, LanguageMarker } from "@/components/paste/language-marker"
import { showUndo } from "@/components/undo-toast"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import { setStarred } from "@/lib/pastes/actions"
import {
  PASTE_PAGE_SIZE,
  type PageInfo,
  type PasteListQuery,
  type PasteSort,
  pasteListSearch,
  type VisibilityFilter,
} from "@/lib/pastes/list-query"
import type { PasteRow } from "@/lib/pastes/rows"
import { RowMenu } from "./row-menu"
import {
  FilterMenu,
  ListHeader,
  MobileFilterSheet,
  Pagination,
  QuickChips,
  SearchField,
  SortMenu,
  ViewToggle,
} from "./toolbar"
import { useListQuery } from "./use-list-query"

export type Sort = PasteSort

// Visibility as a quiet outlined label with an icon, so a column of them doesn't shout. Burn after
// read keeps the blue, since it is the one that changes what happens to the paste.
export function RowBadge({
  row,
  short = false,
  className,
}: {
  row: Pick<PasteRow, "visibility" | "burnAfterRead">
  // The mobile list has room for "Burn" only.
  short?: boolean
  className?: string
}) {
  const t = useTranslations("Workspace")
  const base = cn("h-6 gap-1.5 px-2 text-xs font-normal [&_svg]:size-3", className)
  if (row.burnAfterRead)
    return (
      <Badge variant="muted" className={cn(base, "border-link/40 text-link")}>
        <FlameIcon aria-hidden="true" />
        {short ? t("burn") : t("burn_after_read")}
      </Badge>
    )
  const Icon =
    row.visibility === "public" ? GlobeIcon : row.visibility === "private" ? LockIcon : LinkIcon
  return (
    <Badge variant="muted" className={cn(base, "text-foreground/80")}>
      <Icon aria-hidden="true" className="text-muted-foreground" />
      {t(row.visibility)}
    </Badge>
  )
}

// Visibility folded into a mobile row's meta line: a 12px icon before the slug, named for screen
// readers. Burn after read keeps its blue flame.
export function VisibilityIcon({ row }: { row: Pick<PasteRow, "visibility" | "burnAfterRead"> }) {
  const t = useTranslations("Workspace")
  const Icon = row.burnAfterRead
    ? FlameIcon
    : row.visibility === "public"
      ? GlobeIcon
      : row.visibility === "private"
        ? LockIcon
        : LinkIcon
  return (
    <>
      <Icon
        aria-hidden="true"
        className={cn("size-3 shrink-0", row.burnAfterRead ? "text-link" : "text-muted-foreground")}
      />
      <span className="sr-only">
        {row.burnAfterRead ? t("burn_after_read") : t(row.visibility)}
      </span>
    </>
  )
}

// Expiring soon reads in blue; already expired reads muted, since nothing is left to do about it.
export function expiryClass(row: Pick<PasteRow, "expiresSoon" | "expiresAt">) {
  if (row.expiresAt !== null && row.expiresAt <= Date.now()) return "text-muted-foreground"
  return row.expiresSoon ? "text-link" : undefined
}

// The table renders one authorized page. Filters, sorting and paging are URL-driven server reads.
export function PasteList({
  title,
  rows,
  origin,
  host,
  mode,
  collections,
  actions,
  mobileActions,
  query: serverQuery,
  pagination,
  languageOptions,
}: {
  title: string
  rows: PasteRow[]
  origin: string
  host: string
  mode: "mine" | "starred" | "collection"
  collections: Collection[]
  actions?: React.ReactNode
  // A compact version of `actions` for the phone's title row.
  mobileActions?: React.ReactNode
  query: PasteListQuery
  pagination: PageInfo
  languageOptions: string[]
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  const sortOptions: { value: Sort; label: string }[] = [
    { value: "updated", label: t("last_updated") },
    { value: "views", label: t("most_viewed") },
    { value: "expires", label: t("expiring_soonest") },
    { value: "title", label: t("title") },
  ]
  const visibilityOptions: { value: VisibilityFilter; label: string }[] = [
    { value: "public", label: t("public") },
    { value: "unlisted", label: t("unlisted") },
    { value: "private", label: t("private") },
    { value: "burn", label: t("burn_after_read") },
  ]

  const { query, update, pending } = useListQuery(serverQuery, pasteListSearch)
  const { languages, visibility, collections: inCollections, owner, sort } = query
  const [view, setView] = React.useState<"list" | "grid">("list")
  const filtering = Boolean(
    query.q || languages.length || visibility.length || inCollections.length || owner !== "all",
  )
  const start = (pagination.page - 1) * PASTE_PAGE_SIZE
  const range = `${formatNumber(start + 1, locale)}–${formatNumber(start + rows.length, locale)}`

  const filterSheet = (
    <MobileFilterSheet
      sort={{
        value: sort,
        defaultValue: "updated" as Sort,
        options: sortOptions,
        onChange: (sort) => update({ sort }),
      }}
      filters={[
        {
          id: "language",
          label: t("language"),
          options: languageOptions.map((id) => ({
            value: id,
            label: <LanguageLabel language={id} />,
          })),
          selected: languages,
          onChange: (languages) => update({ languages }),
        },
        {
          id: "visibility",
          label: t("visibility"),
          options: visibilityOptions,
          selected: visibility,
          onChange: (visibility) => update({ visibility: visibility as VisibilityFilter[] }),
        },
        {
          id: "collection",
          label: t("collection"),
          options:
            mode === "collection" ? [] : collections.map((c) => ({ value: c.slug, label: c.name })),
          selected: inCollections,
          onChange: (collections) => update({ collections }),
        },
      ]}
      total={pagination.total}
      pending={pending}
      onClear={() => update({ sort: "updated", languages: [], visibility: [], collections: [] })}
    />
  )

  const quick =
    mode === "starred" ? (
      <QuickChips
        label={t("show")}
        value={owner}
        onChange={(owner) => update({ owner })}
        options={[
          { value: "all", label: t("all") },
          { value: "mine", label: t("mine") },
          { value: "shared", label: t("shared_with_me") },
        ]}
        trailing={filterSheet}
      />
    ) : (
      <QuickChips
        label={t("visibility")}
        value={
          visibility.length === 0 ? "all" : visibility.length === 1 ? (visibility[0] ?? null) : null
        }
        onChange={(next) => update({ visibility: next === "all" ? [] : [next] })}
        options={[{ value: "all" as const, label: t("all") }, ...visibilityOptions]}
        trailing={filterSheet}
      />
    )

  return (
    <div aria-busy={pending} className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={title}
        count={pagination.totalAll}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            {actions}
          </>
        }
        mobileActions={mobileActions ?? actions}
      />

      <div className="flex flex-col gap-3 lg:hidden">
        <SearchField value={query.q} onChange={(q) => update({ q }, true)} />
        {quick}
      </div>

      {/* The filters sit above the table on the page, and the table gets its own card. */}
      <div className="flex flex-col gap-3">
        <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SearchField value={query.q} onChange={(q) => update({ q }, true)} />
            <FilterMenu
              label={t("language")}
              options={languageOptions.map((id) => ({
                value: id,
                label: <LanguageLabel language={id} />,
              }))}
              selected={languages}
              onChange={(languages) => update({ languages })}
            />
            <FilterMenu
              label={t("visibility")}
              options={visibilityOptions}
              selected={visibility}
              onChange={(visibility) => update({ visibility: visibility as VisibilityFilter[] })}
            />
            {mode === "collection" || collections.length === 0 ? null : (
              <FilterMenu
                label={t("collection")}
                options={collections.map((c) => ({
                  value: c.slug,
                  label: <span className="font-mono">{c.name}</span>,
                }))}
                selected={inCollections}
                onChange={(collections) => update({ collections })}
              />
            )}
          </div>
          <SortMenu value={sort} options={sortOptions} onChange={(sort) => update({ sort })} />
        </div>

        <div
          className={cn(
            "flex flex-col",
            view !== "grid" && "lg:overflow-hidden lg:rounded-lg lg:border lg:border-border",
          )}
        >
          {pagination.total === 0 ? (
            <EmptyState filtering={filtering} mode={mode} />
          ) : view === "grid" ? (
            <ul className="hidden grid-cols-2 gap-3 xl:grid-cols-3 lg:grid">
              {rows.map((row) => (
                <li
                  key={row.slug}
                  className="rounded-lg relative flex min-w-0 flex-col gap-3 border border-border p-4 hover:border-foreground/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/pastes/${row.slug}`}
                      title={row.title}
                      className="min-w-0 flex-1 line-clamp-2 [overflow-wrap:anywhere] text-sm font-medium after:absolute after:inset-0"
                    >
                      {row.title}
                    </Link>
                    <RowMenu row={row} origin={origin} />
                  </div>
                  <span className="[overflow-wrap:anywhere] font-mono text-xs text-muted-foreground">
                    {host}/{row.slug}
                  </span>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-[13px] text-foreground/80">
                    <LanguageLabel language={row.language} />
                    <RowBadge row={row} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{t("views_count", { count: row.views })}</span>
                    <span>{row.updatedLabel}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Table className="hidden min-w-[960px] table-fixed lg:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHead value="title" sort={sort} onSort={(sort) => update({ sort })}>
                    {t("paste")}
                  </SortHead>
                  <TableHead className="w-[130px]">{t("language")}</TableHead>
                  <TableHead className="w-[156px]">{t("visibility")}</TableHead>
                  <SortHead
                    value="views"
                    sort={sort}
                    onSort={(sort) => update({ sort })}
                    className="w-20 text-right"
                    alignEnd
                  >
                    {t("views")}
                  </SortHead>
                  <SortHead
                    value="expires"
                    sort={sort}
                    onSort={(sort) => update({ sort })}
                    className="w-[130px] pl-7"
                  >
                    {t("expires")}
                  </SortHead>
                  <SortHead
                    value="updated"
                    sort={sort}
                    onSort={(sort) => update({ sort })}
                    className="w-[116px]"
                  >
                    {t("updated")}
                  </SortHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.slug} className="relative">
                    <TableCell className="truncate">
                      <Link
                        href={`/pastes/${row.slug}`}
                        title={row.title}
                        className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                      >
                        {row.title}
                      </Link>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {row.owner ? `@${row.owner.username} · ` : ""}
                        {host}/{row.slug}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] text-foreground/80">
                      <LanguageLabel language={row.language} />
                    </TableCell>
                    <TableCell>
                      <RowBadge row={row} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px] tabular-nums">
                      {formatNumber(row.views, locale)}
                    </TableCell>
                    <TableCell
                      className={cn("pl-7 text-[13px] text-foreground/80", expiryClass(row))}
                    >
                      {row.expiresLabel}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {row.updatedLabel}
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      {mode === "starred" ? (
                        <button
                          type="button"
                          aria-label={t("unstar_named", { name: row.title })}
                          onClick={async () => {
                            await setStarred(row.slug, false)
                            showUndo({
                              labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
                              message: t("removed_from_starred_named", { name: row.title }),
                              undo: () => setStarred(row.slug, true),
                            })
                          }}
                          className="rounded-md relative z-10 inline-flex size-7 items-center justify-center text-highlight outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          <StarIcon className="size-4 fill-current" />
                        </button>
                      ) : (
                        <RowMenu row={row} origin={origin} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Mobile list */}
          {pagination.total > 0 ? (
            <ul className="flex flex-col lg:hidden">
              {rows.map((row) => (
                <li
                  key={row.slug}
                  className="relative flex items-center gap-3 border-b border-border py-3"
                >
                  <LanguageMarker language={row.language} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      href={`/pastes/${row.slug}`}
                      title={row.title}
                      className="truncate text-[15px] font-medium after:absolute after:inset-0"
                    >
                      {row.title}
                    </Link>
                    <span
                      className={cn(
                        "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
                        expiryClass(row),
                      )}
                    >
                      <VisibilityIcon row={row} />
                      <span className="truncate">
                        <span className="font-mono">
                          {row.owner ? `@${row.owner.username}` : row.slug}
                        </span>
                        {" · "}
                        {row.burnAfterRead
                          ? row.expiresLabel
                          : row.expiresSoon
                            ? t("expires_label", { time: row.expiresLabel })
                            : t("views_count", { count: row.views })}
                      </span>
                    </span>
                  </div>
                  <RowMenu row={row} origin={origin} variant="sheet" />
                </li>
              ))}
            </ul>
          ) : null}

          {pagination.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 lg:border-t lg:border-border lg:px-5">
              <span className="text-[13px] text-muted-foreground">
                {t("pagination_summary", { range, total: formatNumber(pagination.total, locale) })}
                {filtering
                  ? t("filtered_from", { total: formatNumber(pagination.totalAll, locale) })
                  : ""}
              </span>
              <Pagination
                page={pagination.page}
                pageCount={pagination.pageCount}
                onChange={(page) =>
                  update({
                    page,
                    cursor:
                      page === pagination.page + 1
                        ? pagination.nextCursor
                        : page === pagination.page - 1
                          ? pagination.previousCursor
                          : undefined,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// A column header that sorts the list by that column. Title and expiry sort ascending (A to Z,
// soonest first), views and updated descending (most, newest first); the arrow says which.
function SortHead({
  value,
  sort,
  onSort,
  className,
  alignEnd = false,
  children,
}: {
  value: Sort
  sort: Sort
  onSort: (sort: Sort) => void
  className?: string
  alignEnd?: boolean
  children: React.ReactNode
}) {
  const active = sort === value
  const ascending = value === "title" || value === "expires"
  const Arrow = ascending ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(value)}
        className={cn(
          "group/sort -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
          active && "text-foreground",
          alignEnd && "flex-row-reverse",
        )}
      >
        {children}
        <Arrow
          aria-hidden="true"
          className={cn(
            "size-3 transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-60",
          )}
        />
      </button>
    </TableHead>
  )
}

function EmptyState({
  filtering,
  mode,
}: {
  filtering: boolean
  mode: "mine" | "starred" | "collection"
}) {
  const t = useTranslations("Workspace")
  const text = filtering
    ? t("no_pastes_match_these_filters")
    : mode === "starred"
      ? t("star_a_paste_to_keep_it_here")
      : mode === "collection"
        ? t("no_pastes_in_this_collection_yet")
        : t("no_pastes_yet")

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-sm text-muted-foreground">
      {text}
      {!filtering && mode !== "starred" ? (
        <Link href="/new" className="font-medium text-link hover:underline">
          {t("create_a_paste")}
        </Link>
      ) : null}
    </div>
  )
}
