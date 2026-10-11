"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { createCollection } from "@/lib/collections/actions"
import { type Collection, defaultHue } from "@/lib/collections/types"
import { CollectionLookPicker } from "./icon-picker"
import { CollectionNameDialog } from "./name-dialog"

// The "New collection" dialog. Its trigger lives with the caller (the sidebar's + button, the
// Collections page, a paste's "Add to collection" menu), so this only takes the open state. By
// default it opens the new collection; `onCreated` replaces that. `existing` is how many
// collections the viewer has, which picks the starting hue.
export function NewCollectionDialog({
  open,
  onOpenChange,
  existing,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: number
  onCreated?: (slug: string) => void
}) {
  const router = useRouter()
  const [look, setLook] = React.useState<Pick<Collection, "icon" | "hue">>({
    icon: "square",
    hue: defaultHue(existing),
  })

  // Every new collection starts from the default look.
  React.useEffect(() => {
    if (open) setLook({ icon: "square", hue: defaultHue(existing) })
  }, [open, existing])

  return (
    <CollectionNameDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New collection"
      description="Group related pastes under one name."
      submitLabel="Create collection"
      pendingLabel="Creating…"
      label="Name"
      placeholder="e.g. api-snippets"
      leading={
        <CollectionLookPicker
          icon={look.icon}
          hue={look.hue}
          onPick={(next) => setLook((current) => ({ ...current, ...next }))}
        />
      }
      onSubmit={async (name) => {
        const result = await createCollection(name, look)
        if (result.ok) {
          if (onCreated) onCreated(result.slug)
          else router.push(`/collections/${result.slug}`)
        }
        return result
      }}
    />
  )
}
