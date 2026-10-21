"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("Workspace")
  const router = useRouter()

  return (
    <CollectionNameDialog
      open={open}
      onOpenChange={onOpenChange}
      title={parentName ? t("new_subfolder") : t("new_folder")}
      description={
        parentName
          ? t("folder_created_inside", { name: parentName })
          : t("folder_create_description")
      }
      submitLabel={t("create_folder")}
      pendingLabel={t("creating")}
      label={t("name")}
      fieldLabel={t("folder_name")}
      maxLength={MAX_FOLDER_NAME_LENGTH}
      placeholder={t("folder_name_placeholder")}
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
