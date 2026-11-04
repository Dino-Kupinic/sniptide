"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { NavigationLink as Link } from "@/components/navigation-link"
import { LanguageLabel } from "@/components/paste/language-icon"
import { useListView } from "@/components/shell/page-header"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import type { HighlightedLines } from "@/lib/highlight/types"
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
import { PasteBulkActions } from "./bulk-actions"
import { PasteCard } from "./paste-card"
import { PasteMobileList, PasteTable } from "./paste-table"
import { SelectionBar, useRowSelection } from "./selection"
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

// The table renders one authorized page. Filters, sorting and paging are URL-driven server reads.
export function PasteList({
  title,
  rows,
  origin,
  mode,
  collections,
  collection,
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
  mode: "mine" | "starred" | "collection"
  collections: Collection[]
  // The collection whose page this is, in collection mode.
  collection?: string
  actions?: React.ReactNode
  // A compact version of `actions` for the phone's title row.
  mobileActions?: React.ReactNode
  query: PasteListQuery
  pagination: PageInfo
  languageOptions: string[]
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
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
  const slugs = React.useMemo(() => rows.map((row) => row.slug), [rows])
  const selection = useRowSelection(view === "grid" ? [] : slugs)
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
            <PasteTable
              rows={rows}
              origin={origin}
              sortHead={headProps}
              selection={selection}
              action={mode === "starred" ? "unstar" : "menu"}
            />
          )}

          {/* Mobile list */}
          {pagination.total > 0 ? <PasteMobileList rows={rows} origin={origin} /> : null}
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

        <SelectionBar selection={selection}>
          <PasteBulkActions
            rows={rows}
            selection={selection}
            mode={mode}
            collections={collections}
            collection={collection}
          />
        </SelectionBar>
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
