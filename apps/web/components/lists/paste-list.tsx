"use client"

import { Badge } from "@sniptide/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
  TableSortHead,
} from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"
import { FlameIcon, GlobeIcon, LinkIcon, LockIcon, StarIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type * as React from "react"
import { NavigationLink as Link } from "@/components/navigation-link"
import { LanguageIcon, LanguageLabel } from "@/components/paste/language-icon"
import { useListView } from "@/components/shell/page-header"
import { showUndo } from "@/components/undo-toast"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import type { HighlightedLines } from "@/lib/highlight/types"
import { setStarred } from "@/lib/pastes/actions"
import {
  DEFAULT_SORT_DIRECTION,
  PASTE_PAGE_SIZE,
  type PageInfo,
  type PasteListQuery,
  type PasteSort,
  pasteListSearch,
  type SortDirection,
  sortDirection,
  type VisibilityFilter,
} from "@/lib/pastes/list-query"
import type { PasteRow } from "@/lib/pastes/rows"
import { PasteCard } from "./paste-card"
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
  previews,
}: {
  title: string
  rows: PasteRow[]
  // The first highlighted lines of each paste, by slug, for the grid view's cards.
  previews?: Record<string, HighlightedLines>
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
  const { view, setView } = useListView()
  const filtering = Boolean(
    query.q || languages.length || visibility.length || inCollections.length || owner !== "all",
  )
  const direction = sortDirection(query)
  // Each header starts in its sort's natural direction, and a flipped one is kept in the URL.
  const headProps = (value: Sort) => ({
    direction: sort === value ? direction : null,
    firstDirection: DEFAULT_SORT_DIRECTION[value],
    onSort: (next: SortDirection) =>
      update({ sort: value, dir: next === DEFAULT_SORT_DIRECTION[value] ? undefined : next }),
  })
  const start = (pagination.page - 1) * PASTE_PAGE_SIZE
  const range = `${formatNumber(start + 1, locale)}–${formatNumber(start + rows.length, locale)}`

  const filterSheet = (
    <MobileFilterSheet
      sort={{
        value: sort,
        defaultValue: "updated" as Sort,
        options: sortOptions,
        onChange: (sort) => update({ sort, dir: undefined }),
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
      onClear={() =>
        update({ sort: "updated", dir: undefined, languages: [], visibility: [], collections: [] })
      }
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
        headerActions={mode === "collection" ? actions : null}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            {actions}
          </>
        }
        mobileActions={mobileActions ?? actions}
      />

      <div className="flex flex-col gap-3 lg:hidden">
        <SearchField pending={pending} value={query.q} onChange={(q) => update({ q }, true)} />
        {quick}
      </div>

      {/* The filters sit above the table on the page, and the table gets its own card. */}
      <div className="flex flex-col gap-3">
        <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SearchField pending={pending} value={query.q} onChange={(q) => update({ q }, true)} />
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
          <SortMenu
            value={sort}
            options={sortOptions}
            onChange={(sort) => update({ sort, dir: undefined })}
          />
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
            <ul className="hidden grid-cols-2 gap-4 xl:grid-cols-3 lg:grid">
              {rows.map((row) => (
                <PasteCard key={row.slug} row={row} lines={previews?.[row.slug]} origin={origin} />
              ))}
            </ul>
          ) : (
            <Table className="hidden min-w-[1040px] table-fixed lg:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableSortHead {...headProps("title")}>{t("paste")}</TableSortHead>
                  <TableSortHead {...headProps("language")} className="w-[140px]">
                    {t("language")}
                  </TableSortHead>
                  <TableSortHead {...headProps("visibility")} className="w-[160px]">
                    {t("visibility")}
                  </TableSortHead>
                  <TableSortHead {...headProps("views")} className="w-24" alignEnd>
                    {t("views")}
                  </TableSortHead>
                  <TableSortHead {...headProps("expires")} className="w-[140px]">
                    {t("expires")}
                  </TableSortHead>
                  <TableSortHead {...headProps("updated")} className="w-[140px]">
                    {t("updated")}
                  </TableSortHead>
                  <TablePinnedHead className="w-16">
                    <span className="sr-only">{t("actions")}</span>
                  </TablePinnedHead>
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
                    <TableCell className={cn("text-[13px] text-foreground/80", expiryClass(row))}>
                      {row.expiresLabel}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {row.updatedLabel}
                    </TableCell>
                    <TablePinnedCell className="text-center">
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
                    </TablePinnedCell>
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
                  <LanguageIcon language={row.language} />
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
        </div>

        {pagination.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 lg:py-0">
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
