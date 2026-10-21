"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("Workspace")
  const router = useRouter()

  return (
    <CollectionNameDialog
      open
      onOpenChange={onOpenChange}
      title={t("rename_folder")}
      description={t("rename_folder_description")}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      initialName={folder.name}
      fieldLabel={t("folder_name")}
      maxLength={MAX_FOLDER_NAME_LENGTH}
      placeholder={t("folder_name_placeholder")}
      onSubmit={async (name) => {
        const result = await renameFolder(folder.id, name)
        if (result.ok) router.refresh()
        return result
      }}
    />
  )
}
