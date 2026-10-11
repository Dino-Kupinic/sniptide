"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { renameCollection } from "@/lib/collections/actions"
import type { Collection } from "@/lib/collections/types"
import { CollectionLookPicker } from "./icon-picker"
import { CollectionNameDialog } from "./name-dialog"

// Mounted when opened, so cancelling discards the draft name, icon and color.
export function RenameCollectionDialog({
  collection,
  onOpenChange,
}: {
  collection: Collection
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [look, setLook] = React.useState<Pick<Collection, "icon" | "hue">>({
    icon: collection.icon,
    hue: collection.hue,
  })

  return (
    <CollectionNameDialog
      open
      onOpenChange={onOpenChange}
      title="Rename collection"
      description="The collection keeps its link, and its pastes stay in it."
      submitLabel="Save"
      pendingLabel="Saving…"
      initialName={collection.name}
      leading={
        <CollectionLookPicker
          icon={look.icon}
          hue={look.hue}
          onPick={(next) => setLook((current) => ({ ...current, ...next }))}
        />
      }
      onSubmit={async (name) => {
        const result = await renameCollection(collection.slug, name, look)
        if (result.ok) router.refresh()
        return result
      }}
    />
  )
}
