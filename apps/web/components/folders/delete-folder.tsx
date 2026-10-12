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
import * as React from "react"
import { deleteFolder } from "@/lib/folders/actions"
import { descendantIds, subtreePasteCount } from "@/lib/folders/tree"
import type { DeleteContents, Folder } from "@/lib/folders/types"

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

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

  const inside = [
    pastes > 0 ? plural(pastes, "paste") : null,
    subfolders > 0 ? plural(subfolders, "subfolder") : null,
  ]
    .filter(Boolean)
    .join(" and ")

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete “{folder.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {empty
            ? "The folder is empty, so nothing else is affected."
            : `It holds ${inside}. Choose what happens to ${pastes + subfolders === 1 ? "it" : "them"}; nothing is deleted for good.`}
        </AlertDialogDescription>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter className="flex-wrap">
          <AlertDialogClose render={<Button variant="outline" size="lg" />}>
            Cancel
          </AlertDialogClose>
          {empty ? (
            <Button
              size="lg"
              className="bg-destructive text-white hover:bg-destructive/85"
              disabled={pending}
              onClick={() => remove("move")}
            >
              {pending ? "Deleting…" : "Delete folder"}
            </Button>
          ) : (
            <>
              <Button variant="outline" size="lg" disabled={pending} onClick={() => remove("move")}>
                Move contents to {parent ? `“${parent.name}”` : "the top level"}
              </Button>
              <Button
                size="lg"
                className="bg-destructive text-white hover:bg-destructive/85"
                disabled={pending}
                onClick={() => remove("trash")}
              >
                {pastes > 0 ? `Move ${plural(pastes, "paste")} to trash` : "Delete with subfolders"}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
