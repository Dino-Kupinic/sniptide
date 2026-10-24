"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@sniptide/ui/components/alert-dialog"
import { Button } from "@sniptide/ui/components/button"
import { useTranslations } from "next-intl"
import * as React from "react"
import { deleteFolder } from "@/lib/folders/actions"
import { descendantIds, subtreePasteCount } from "@/lib/folders/tree"
import type { DeleteContents, Folder } from "@/lib/folders/types"

// Deleting a folder asks what happens to what's inside. There is no preselected answer and no
// "delete everything": the contents either move up a level or, for pastes, go to the trash where
// they can still be restored. An empty folder just asks to be deleted.
export function DeleteFolderDialog({
  folder,
  folders,
  onOpenChange,
  onDeleted,
}: {
  folder: Folder
  folders: Folder[]
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const t = useTranslations("Workspace")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const subfolders = descendantIds(folders, folder.id).length
  const pastes = subtreePasteCount(folders, folder.id)
  const empty = subfolders === 0 && pastes === 0
  const parent = folders.find((other) => other.id === folder.parentId)

  function remove(contents: DeleteContents) {
    startTransition(async () => {
      const result = await deleteFolder(folder.id, contents)
      if (!result.ok) return setError(result.error)
      onOpenChange(false)
      onDeleted()
    })
  }

  const shape = pastes > 0 && subfolders > 0 ? "both" : pastes > 0 ? "pastes" : "subfolders"

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{t("delete_folder_title", { name: folder.name })}</AlertDialogTitle>
        <AlertDialogDescription>
          {empty
            ? t("delete_folder_empty")
            : t("delete_folder_holds", { shape, pastes, subfolders })}
        </AlertDialogDescription>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter className="flex-wrap">
          <AlertDialogClose render={<Button variant="outline" size="lg" />}>
            {t("cancel")}
          </AlertDialogClose>
          {empty ? (
            <Button
              size="lg"
              className="bg-destructive text-white hover:bg-destructive/85"
              disabled={pending}
              onClick={() => remove("move")}
            >
              {pending ? t("deleting") : t("delete_folder")}
            </Button>
          ) : (
            <>
              <Button variant="outline" size="lg" disabled={pending} onClick={() => remove("move")}>
                {parent
                  ? t("delete_folder_move_contents_to", { name: parent.name })
                  : t("delete_folder_move_contents_top")}
              </Button>
              <Button
                size="lg"
                className="bg-destructive text-white hover:bg-destructive/85"
                disabled={pending}
                onClick={() => remove("trash")}
              >
                {pastes > 0
                  ? t("delete_folder_trash_pastes", { count: pastes })
                  : t("delete_folder_with_subfolders")}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
