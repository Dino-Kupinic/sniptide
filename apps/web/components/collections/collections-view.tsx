"use client"

import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { ListHeader } from "@/components/lists/toolbar"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import { CollectionMenu } from "./collection-menu"
import { CollectionIcon } from "./icon"
import { NewCollectionDialog } from "./new-collection"

// The Collections page: every collection with its paste count, and the way to make a new one.
// It is also where phones, which have no sidebar, manage collections.
export function CollectionsView({ collections }: { collections: Collection[] }) {
  const [creating, setCreating] = React.useState(false)
  const create = (
    <Button size="lg" onClick={() => setCreating(true)}>
      <PlusIcon />
      New collection
    </Button>
  )

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title="Collections"
        count={collections.length}
        description="Group related pastes under one name."
        actions={create}
      />
      <div className="lg:hidden">{create}</div>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-border px-4 py-14 text-center text-sm text-muted-foreground">
          No collections yet.
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="font-medium text-link hover:underline"
          >
            Create your first collection
          </button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border border border-border">
          {collections.map((collection) => (
            <li
              key={collection.slug}
              className={cn("relative flex items-center gap-3 px-4 py-3 hover:bg-muted/50")}
            >
              <CollectionIcon icon={collection.icon} hue={collection.hue} />
              <Link
                href={`/collections/${collection.slug}`}
                className="min-w-0 flex-1 truncate font-mono text-[13px] outline-none after:absolute after:inset-0 focus-visible:underline"
              >
                {collection.name}
              </Link>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatNumber(collection.pasteCount)}{" "}
                {collection.pasteCount === 1 ? "paste" : "pastes"}
              </span>
              <CollectionMenu
                collection={collection}
                className="relative z-10 flex size-8 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
              />
            </li>
          ))}
        </ul>
      )}

      <NewCollectionDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
