"use client"

import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { ListHeader } from "@/components/lists/toolbar"
import { useSidebarUpdate } from "@/components/shell/app-shell"
import type { Collection } from "@/lib/collections/types"
import { CollectionMenu } from "./collection-menu"
import { CollectionIcon } from "./icon"
import { NewCollectionDialog } from "./new-collection"

// The Collections page: every collection with its paste count, and the way to make a new one.
// It is also where phones, which have no sidebar, manage and reorder collections.
export function CollectionsView({ collections }: { collections: Collection[] }) {
  const t = useTranslations("Workspace")
  const [creating, setCreating] = React.useState(false)
  const updateSidebar = useSidebarUpdate()
  const [order, setOrder] = React.useState(() => collections.map((item) => item.slug))
  // Follow the server when collections are added, renamed or removed.
  React.useEffect(() => setOrder(collections.map((item) => item.slug)), [collections])
  const bySlug = new Map(collections.map((item) => [item.slug, item]))
  const ordered = order.flatMap((slug) => bySlug.get(slug) ?? [])

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
        <ul className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border">
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
      )}

      <NewCollectionDialog
        existing={collections.length}
        open={creating}
        onOpenChange={setCreating}
      />
    </div>
  )
}
