"use client"

import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { ListHeader } from "@/components/lists/toolbar"
import type { Collection } from "@/lib/collections/types"
import { CollectionMenu } from "./collection-menu"
import { CollectionIcon } from "./icon"
import { NewCollectionDialog } from "./new-collection"

// The Collections page: every collection with its paste count, and the way to make a new one.
// It is also where phones, which have no sidebar, manage collections.
export function CollectionsView({ collections }: { collections: Collection[] }) {
  const t = useTranslations("Workspace")
  const [creating, setCreating] = React.useState(false)
  const create = (
    <Button size="lg" className="max-w-full whitespace-normal" onClick={() => setCreating(true)}>
      <PlusIcon />
      {t("new_collection")}
    </Button>
  )

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={t("collections")}
        count={collections.length}
        description={t("group_related_pastes_under_one_name")}
        actions={create}
      />
      <div className="lg:hidden">{create}</div>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-border px-4 py-14 text-center text-sm text-muted-foreground">
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
        <ul className="flex flex-col divide-y divide-border border border-border">
          {collections.map((collection) => (
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
                className="col-start-2 row-start-1 min-w-0 truncate font-mono text-[13px] outline-none after:absolute after:inset-0 focus-visible:underline"
              >
                {collection.name}
              </Link>
              <span className="col-span-3 col-start-1 row-start-2 text-xs text-muted-foreground tabular-nums sm:col-span-1 sm:col-start-3 sm:row-start-1">
                {t("paste_count", { count: collection.pasteCount })}
              </span>
              <CollectionMenu
                collection={collection}
                className="relative z-10 col-start-3 row-start-1 flex size-8 shrink-0 sm:col-start-4 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
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
