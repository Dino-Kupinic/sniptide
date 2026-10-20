"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("Workspace")
  const router = useRouter()
  const [look, setLook] = React.useState<Pick<Collection, "icon" | "hue">>({
    icon: collection.icon,
    hue: collection.hue,
  })

  return (
    <CollectionNameDialog
      open
      onOpenChange={onOpenChange}
      title={t("rename_collection")}
      description={t("the_collection_keeps_its_link_and_its_pastes")}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
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
