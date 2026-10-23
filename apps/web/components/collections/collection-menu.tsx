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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { showUndo } from "@/components/undo-toast"
import { deleteCollection, restoreCollection } from "@/lib/collections/actions"
import type { Collection } from "@/lib/collections/types"
import { runAction } from "@/lib/feedback"
import { RenameCollectionDialog } from "./rename-collection"

// Rename and delete for one collection. `afterDelete` is where to go once it's gone: a
// collection's own page has nothing left to show, while the Collections page just refreshes.
export function CollectionMenu({
  collection,
  afterDelete,
  className,
}: {
  collection: Collection
  afterDelete?: string
  className?: string
}) {
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  const router = useRouter()
  const [renaming, setRenaming] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("actions_for", { name: collection.name })}
          className={
            className ??
            "rounded-lg flex size-8 items-center justify-center border border-border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
          }
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <PencilIcon />
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2Icon />
            {t("delete_collection")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {renaming ? (
        <RenameCollectionDialog collection={collection} onOpenChange={setRenaming} />
      ) : null}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {t("delete_collection_title", { name: collection.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {collection.pasteCount > 0
              ? t("collection_pastes_kept", { count: collection.pasteCount })
              : t("the_collection_is_empty_so_no_pastes_are")}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="lg" />}>
              {t("cancel")}
            </AlertDialogClose>
            <Button
              size="lg"
              className="bg-destructive text-white hover:bg-destructive/85"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await runAction(() => deleteCollection(collection.slug), {
                    error: t("couldnt_delete_the_collection_try_again"),
                  })
                  const snapshot = result.ok ? result.value : null
                  setDeleting(false)
                  if (!result.ok) return
                  if (afterDelete) router.push(afterDelete)
                  else router.refresh()
                  if (snapshot) {
                    showUndo({
                      labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
                      message: t("deleted_named", { name: collection.name }),
                      undo: () => restoreCollection(snapshot),
                      onUndone: () => {
                        if (afterDelete) router.push(`/collections/${snapshot.slug}`)
                      },
                    })
                  }
                })
              }
            >
              {pending ? t("deleting") : t("delete_collection")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
