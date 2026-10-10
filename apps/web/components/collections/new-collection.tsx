"use client"

import { useRouter } from "next/navigation"
import { createCollection } from "@/lib/collections/actions"
import { CollectionNameDialog } from "./name-dialog"

// The "New collection" dialog. Its trigger lives with the caller (the sidebar's + button, the
// Collections page), so this only takes the open state.
export function NewCollectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  return (
    <CollectionNameDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New collection"
      description="Group related pastes under one name. You can file a paste in a collection when you create or edit it."
      submitLabel="Create"
      pendingLabel="Creating…"
      onSubmit={async (name) => {
        const result = await createCollection(name)
        if (result.ok) router.push(`/collections/${result.slug}`)
        return result
      }}
    />
  )
}
