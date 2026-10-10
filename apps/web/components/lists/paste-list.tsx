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
import { StarIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { LanguageLabel, LanguageMarker } from "@/components/paste/language-marker"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import { setStarred } from "@/lib/pastes/actions"
import {
  PASTE_PAGE_SIZE,
  type PageInfo,
  type PasteListQuery,
  type PasteSort,
  type VisibilityFilter,
} from "@/lib/pastes/list-query"
import type { PasteRow } from "@/lib/pastes/rows"
import { RowMenu } from "./row-menu"
import {
  FilterMenu,
  ListHeader,
  Pagination,
  QuickChips,
  SearchField,
  SortMenu,
  ViewToggle,
} from "./toolbar"
import { useListQuery } from "./use-list-query"

export type Sort = PasteSort
const sortOptions: { value: Sort; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "views", label: "Most viewed" },
  { value: "expires", label: "Expiring soonest" },
  { value: "title", label: "Title" },
]

const visibilityOptions: { value: VisibilityFilter; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
  { value: "burn", label: "Burn after read" },
]

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
  const base = cn("h-5 px-2 text-xs", className)
  if (row.burnAfterRead)
    return (
      <Badge variant="primary" className={base}>
        {short ? "Burn" : "Burn after read"}
      </Badge>
    )
  if (row.visibility === "public")
    return (
      <Badge variant="solid" className={base}>
        Public
      </Badge>
    )
  if (row.visibility === "private")
    return (
      <Badge variant="muted" className={base}>
        Private
      </Badge>
    )
  return (
    <Badge variant="muted" className={cn(base, "text-foreground")}>
      Unlisted
    </Badge>
  )
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
  query: PasteListQuery
  pagination: PageInfo
  languageOptions: string[]
}) {
  const { query, update, pending } = useListQuery(serverQuery)
  const { languages, visibility, collections: inCollections, owner, sort } = query
  const [view, setView] = React.useState<"list" | "grid">("list")
  const filtering = Boolean(
    query.q || languages.length || visibility.length || inCollections.length || owner !== "all",
  )
  const start = (pagination.page - 1) * PASTE_PAGE_SIZE
  const range = `${start + 1}–${start + rows.length}`

  const quick =
    mode === "starred" ? (
      <QuickChips
        label="Show"
        value={owner}
        onChange={(owner) => update({ owner })}
        options={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
          { value: "shared", label: "Shared with me" },
        ]}
      />
    ) : (
      <QuickChips
        label="Visibility"
        value={(visibility.length === 1 ? visibility[0] : "all") as "all" | VisibilityFilter}
        onChange={(next) => update({ visibility: next === "all" ? [] : [next] })}
        options={[{ value: "all", label: "All" }, ...visibilityOptions]}
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
      />

      <div className="flex flex-col gap-3 lg:hidden">
        <SearchField value={query.q} onChange={(q) => update({ q }, true)} />
        {quick}
      </div>

      <div className="flex flex-col lg:border lg:border-border">
        <div className="hidden items-center justify-between gap-3 p-3 lg:flex">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={query.q} onChange={(q) => update({ q }, true)} />
            <FilterMenu
              label="Language"
              options={languageOptions.map((id) => ({
                value: id,
                label: <LanguageLabel language={id} />,
              }))}
              selected={languages}
              onChange={(languages) => update({ languages })}
            />
            <FilterMenu
              label="Visibility"
              options={visibilityOptions}
              selected={visibility}
              onChange={(visibility) => update({ visibility: visibility as VisibilityFilter[] })}
            />
            {mode === "collection" || collections.length === 0 ? null : (
              <FilterMenu
                label="Collection"
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

        {pagination.total === 0 ? (
          <EmptyState filtering={filtering} mode={mode} />
        ) : view === "grid" ? (
          <ul className="hidden grid-cols-3 gap-3 border-t border-border p-3 lg:grid">
            {rows.map((row) => (
              <li
                key={row.slug}
                className="relative flex flex-col gap-3 border border-border p-4 hover:border-foreground/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/pastes/${row.slug}`}
                    className="text-sm font-medium after:absolute after:inset-0"
                  >
                    {row.title}
                  </Link>
                  <RowMenu row={row} origin={origin} />
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {host}/{row.slug}
                </span>
                <div className="mt-auto flex items-center justify-between text-[13px] text-foreground/80">
                  <LanguageLabel language={row.language} />
                  <RowBadge row={row} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{formatNumber(row.views)} views</span>
                  <span>{row.updatedLabel}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Table className="hidden table-fixed lg:table">
            <TableHeader className="bg-sidebar">
              <TableRow className="hover:bg-transparent">
                <TableHead>Paste</TableHead>
                <TableHead className="w-[130px]">Language</TableHead>
                <TableHead className="w-[120px]">Visibility</TableHead>
                <TableHead className="w-20 text-right">Views</TableHead>
                <TableHead className="w-[130px] pl-7">Expires</TableHead>
                <TableHead className="w-[116px]">Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.slug} className="relative border-border/60">
                  <TableCell className="truncate">
                    <Link
                      href={`/pastes/${row.slug}`}
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
                    {formatNumber(row.views)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "pl-7 text-[13px] text-foreground/80",
                      row.expiresSoon && "text-link",
                    )}
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
                        aria-label={`Unstar ${row.title}`}
                        onClick={() => setStarred(row.slug, false)}
                        className="relative z-10 inline-flex size-7 items-center justify-center text-link outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
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
                    className="truncate text-[15px] font-medium after:absolute after:inset-0"
                  >
                    {row.title}
                  </Link>
                  <span
                    className={cn(
                      "truncate font-mono text-xs text-muted-foreground",
                      row.expiresSoon && "text-link",
                    )}
                  >
                    {row.owner ? `@${row.owner.username}` : `${host}/${row.slug}`}
                    {" · "}
                    {row.burnAfterRead
                      ? row.expiresLabel
                      : row.expiresSoon
                        ? `expires ${row.expiresLabel}`
                        : `${formatNumber(row.views)} views`}
                  </span>
                </div>
                <RowBadge row={row} short className="shrink-0" />
              </li>
            ))}
          </ul>
        ) : null}

        {pagination.total > 0 ? (
          <div className="flex items-center justify-between gap-3 py-3 lg:border-t lg:border-border lg:px-4">
            <span className="text-[13px] text-muted-foreground">
              Showing {range} of {pagination.total}
              {filtering ? ` (filtered from ${pagination.totalAll})` : ""}
            </span>
            <Pagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              onChange={(page) => update({ page })}
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
  const text = filtering
    ? "No pastes match these filters."
    : mode === "starred"
      ? "Star a paste to keep it here."
      : mode === "collection"
        ? "No pastes in this collection yet."
        : "No pastes yet."

  return (
    <div className="flex flex-col items-center gap-3 border-t border-border px-4 py-14 text-center text-sm text-muted-foreground">
      {text}
      {!filtering && mode !== "starred" ? (
        <Link href="/new" className="font-medium text-link hover:underline">
          Create a paste
        </Link>
      ) : null}
    </div>
  )
}
