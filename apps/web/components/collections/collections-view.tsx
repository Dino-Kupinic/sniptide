"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  type SortDirection,
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
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { ListHeader } from "@/components/lists/toolbar"
import { useSidebarUpdate } from "@/components/shell/app-shell"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import { CollectionMenu } from "./collection-menu"
import { CollectionIcon } from "./icon"
import { NewCollectionDialog } from "./new-collection"

type CollectionSort = "name" | "pastes" | "updated"

const FIRST_DIRECTION: Record<CollectionSort, SortDirection> = {
  name: "asc",
  pastes: "desc",
  updated: "desc",
}

function compare(a: Collection, b: Collection, sort: CollectionSort) {
  if (sort === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  if (sort === "pastes") return a.pasteCount - b.pasteCount
  // Empty collections have no date and sort as the oldest.
  return (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
}

// The Collections page: every collection with its paste count, and the way to make a new one.
// It is also where phones, which have no sidebar, manage and reorder collections. The desktop table
// starts in the sidebar's order, and its headers sort it in place without touching that order.
export function CollectionsView({
  collections,
  updatedLabels,
}: {
  collections: Collection[]
  // "3 days ago" per collection slug, worked out on the server so both renders agree.
  updatedLabels: Record<string, string>
}) {
  const t = useTranslations("Workspace")
  const locale = useLocale()
  const [creating, setCreating] = React.useState(false)
  const updateSidebar = useSidebarUpdate()
  const [order, setOrder] = React.useState(() => collections.map((item) => item.slug))
  // Follow the server when collections are added, renamed or removed.
  React.useEffect(() => setOrder(collections.map((item) => item.slug)), [collections])
  const bySlug = new Map(collections.map((item) => [item.slug, item]))
  const ordered = order.flatMap((slug) => bySlug.get(slug) ?? [])
  const [sort, setSort] = React.useState<{ by: CollectionSort; direction: SortDirection } | null>(
    null,
  )
  const sorted = sort
    ? [...ordered].sort((a, b) => compare(a, b, sort.by) * (sort.direction === "asc" ? 1 : -1) || 0)
    : ordered

  // A third click on a header goes back to the sidebar's order.
  const headProps = (by: CollectionSort) => ({
    direction: sort?.by === by ? sort.direction : null,
    firstDirection: FIRST_DIRECTION[by],
    onSort: (direction: SortDirection) =>
      setSort(sort?.by === by && direction === FIRST_DIRECTION[by] ? null : { by, direction }),
  })

  function move(index: number, offset: -1 | 1) {
    const next = [...order]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(index + offset, 0, item)
    setOrder(next)
    // A move switches the sidebar to "Your order", since the order it shows is the one edited.
    updateSidebar((state) => ({
      ...state,
      collectionOrder: next,
      views: { ...state.views, collections: { sort: "custom" } },
    }))
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={t("collections")}
        count={collections.length}
        description={t("group_related_pastes_under_one_name")}
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <PlusIcon />
            {t("new_collection")}
          </Button>
        }
        mobileActions={
          <Button
            size="xl"
            aria-label={t("new_collection")}
            onClick={() => setCreating(true)}
            className="w-10 px-0"
          >
            <PlusIcon />
          </Button>
        }
      />

      {collections.length === 0 ? (
        <div className="rounded-lg flex flex-col items-center gap-3 border border-border px-4 py-14 text-center text-sm text-muted-foreground">
          {t("no_collections_yet")}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="font-medium text-link hover:underline"
          >
            {t("create_your_first_collection")}
          </button>
        </div>
      ) : (
        <>
          <ul className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border lg:hidden">
            {ordered.map((collection, index) => (
              <li
                key={collection.slug}
                className={cn(
                  "relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
                )}
              >
                <CollectionIcon icon={collection.icon} hue={collection.hue} />
                <Link
                  title={collection.name}
                  href={`/collections/${collection.slug}`}
                  className="col-start-2 row-start-1 min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline lg:font-normal"
                >
                  {collection.name}
                </Link>
                <span className="col-span-2 col-start-2 row-start-2 text-xs text-muted-foreground tabular-nums sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  {t("paste_count", { count: collection.pasteCount })}
                </span>
                <CollectionMenu
                  collection={collection}
                  onMove={{
                    up: index > 0 ? () => move(index, -1) : undefined,
                    down: index < ordered.length - 1 ? () => move(index, 1) : undefined,
                  }}
                  className="rounded-lg relative z-10 col-start-3 row-span-2 row-start-1 -mr-2.5 flex size-10 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted sm:col-start-4 sm:row-span-1 lg:mr-0 lg:size-8"
                />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-lg border border-border lg:block">
            <Table className="min-w-[720px] table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableSortHead {...headProps("name")}>{t("collection")}</TableSortHead>
                  <TableSortHead {...headProps("pastes")} className="w-28" alignEnd>
                    {t("pastes")}
                  </TableSortHead>
                  <TableSortHead {...headProps("updated")} className="w-[160px]">
                    {t("last_updated")}
                  </TableSortHead>
                  <TablePinnedHead className="w-16">
                    <span className="sr-only">{t("actions")}</span>
                  </TablePinnedHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((collection) => {
                  const index = ordered.indexOf(collection)
                  return (
                    <TableRow key={collection.slug} className="relative">
                      <TableCell className="truncate">
                        <div className="flex min-w-0 items-center gap-3">
                          <CollectionIcon icon={collection.icon} hue={collection.hue} />
                          <Link
                            title={collection.name}
                            href={`/collections/${collection.slug}`}
                            className="min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                          >
                            {collection.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-[13px] text-foreground/80 tabular-nums">
                        {formatNumber(collection.pasteCount, locale)}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {updatedLabels[collection.slug] ?? t("no_pastes_yet")}
                      </TableCell>
                      <TablePinnedCell className="text-center">
                        <CollectionMenu
                          collection={collection}
                          // Moving only makes sense in the order it changes.
                          onMove={
                            sort
                              ? undefined
                              : {
                                  up: index > 0 ? () => move(index, -1) : undefined,
                                  down:
                                    index < ordered.length - 1 ? () => move(index, 1) : undefined,
                                }
                          }
                          className="rounded-lg relative z-10 inline-flex size-8 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
                        />
                      </TablePinnedCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <NewCollectionDialog
        existing={collections.length}
        open={creating}
        onOpenChange={setCreating}
      />
    </div>
  )
}
