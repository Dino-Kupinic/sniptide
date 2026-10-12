"use client"

import { useRouter } from "next/navigation"
import { CollectionNameDialog } from "@/components/collections/name-dialog"
import { renameFolder } from "@/lib/folders/actions"
import { type Folder, MAX_FOLDER_NAME_LENGTH } from "@/lib/folders/types"

// Mounted when opened, so cancelling discards the draft name.
export function RenameFolderDialog({
  folder,
  onOpenChange,
}: {
  folder: Folder
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  return (
    <CollectionNameDialog
      open
      onOpenChange={onOpenChange}
      title="Rename folder"
      description="Everything in the folder stays where it is."
      submitLabel="Save"
      pendingLabel="Saving…"
      initialName={folder.name}
      fieldLabel="Folder name"
      maxLength={MAX_FOLDER_NAME_LENGTH}
      placeholder="e.g. Work"
      onSubmit={async (name) => {
        const result = await renameFolder(folder.id, name)
        if (result.ok) router.refresh()
        return result
      }}
    />
  )
}
