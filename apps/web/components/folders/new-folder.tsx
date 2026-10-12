"use client"

import { useRouter } from "next/navigation"
import { CollectionNameDialog } from "@/components/collections/name-dialog"
import { createFolder } from "@/lib/folders/actions"
import { MAX_FOLDER_NAME_LENGTH } from "@/lib/folders/types"

// The "New folder" dialog. Its trigger lives with the caller (the sidebar's + button, a folder's
// menu, a paste's "Move to folder" menu), so this only takes the open state. `parentId` is the
// folder to create it in, null for the top level. By default it opens the new folder; `onCreated`
// replaces that.
export function NewFolderDialog({
  open,
  onOpenChange,
  parentId = null,
  parentName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentId?: string | null
  parentName?: string
  onCreated?: (id: string) => void
}) {
  const router = useRouter()

  return (
    <CollectionNameDialog
      open={open}
      onOpenChange={onOpenChange}
      title={parentName ? "New subfolder" : "New folder"}
      description={
        parentName
          ? `Created inside “${parentName}”.`
          : "Arrange pastes in a folder, like on a disk."
      }
      submitLabel="Create folder"
      pendingLabel="Creating…"
      label="Name"
      fieldLabel="Folder name"
      maxLength={MAX_FOLDER_NAME_LENGTH}
      placeholder="e.g. Work"
      onSubmit={async (name) => {
        const result = await createFolder(name, parentId)
        if (result.ok) {
          if (onCreated) onCreated(result.id)
          else router.push(`/folders/${result.id}`)
        }
        return result
      }}
    />
  )
}
