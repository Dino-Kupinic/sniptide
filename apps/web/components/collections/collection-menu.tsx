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
import { Dialog, DialogContent, DialogTitle } from "@sniptide/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { FormError } from "@sniptide/ui/components/form-error"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListOrderedIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { showUndo } from "@/components/undo-toast"
import { deleteCollection, restoreCollection, setCollectionIcon } from "@/lib/collections/actions"
import type { Collection } from "@/lib/collections/types"
import { runAction } from "@/lib/feedback"
import { IconOptions } from "./icon-picker"
import { RenameCollectionDialog } from "./rename-collection"

// Rename, icon and delete for one collection. `afterDelete` is where to go once it's gone: a
// collection's own page has nothing left to show, while the Collections page just refreshes.
// `onMove` adds Move up and Move down on phones, which have no sidebar to drag collections in;
// a direction it leaves out is the end of the list.
export function CollectionMenu({
  collection,
  afterDelete,
  onMove,
  className,
}: {
  collection: Collection
  afterDelete?: string
  onMove?: { up?: () => void; down?: () => void }
  className?: string
}) {
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  const router = useRouter()
  const [renaming, setRenaming] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [changingIcon, setChangingIcon] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("actions_for", { name: collection.name })}
          className={
            className ??
            "rounded-lg flex size-10 items-center justify-center border border-border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted lg:size-8"
          }
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <PencilIcon />
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setChangingIcon(true)}>
            <PaletteIcon />
            {t("change_icon")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/collections/${collection.slug}/steps`} />}>
            <ListOrderedIcon />
            {t("order_steps")}
          </DropdownMenuItem>
          {onMove ? (
            <>
              <DropdownMenuSeparator className="lg:hidden" />
              <DropdownMenuItem disabled={!onMove.up} onClick={onMove.up} className="lg:hidden">
                <ArrowUpIcon />
                {t("move_up")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!onMove.down} onClick={onMove.down} className="lg:hidden">
                <ArrowDownIcon />
                {t("move_down")}
              </DropdownMenuItem>
            </>
          ) : null}
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

      {changingIcon ? (
        <ChangeIconDialog collection={collection} onOpenChange={setChangingIcon} />
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

// The icon and color picker in a dialog, for touch and for the collection's own page. Every pick
// saves at once, like the sidebar's picker.
function ChangeIconDialog({
  collection,
  onOpenChange,
}: {
  collection: Collection
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Workspace")
  const router = useRouter()
  const [look, setLook] = React.useState({ icon: collection.icon, hue: collection.hue })
  const [error, setError] = React.useState<string | null>(null)
  const [, startTransition] = React.useTransition()

  function pick(next: { icon?: Collection["icon"]; hue?: Collection["hue"] }) {
    const previous = look
    const updated = { icon: next.icon ?? look.icon, hue: next.hue ?? look.hue }
    setLook(updated)
    setError(null)
    startTransition(async () => {
      try {
        await setCollectionIcon(collection.slug, updated.icon, updated.hue)
        router.refresh()
      } catch {
        setLook(previous)
        setError(t("couldnt_change_the_icon_try_again"))
      }
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="gap-2 px-3 pb-3">
        <div className="flex items-center gap-2 px-3">
          <DialogTitle className="min-w-0 flex-1 truncate">
            {t("change_icon_for", { name: collection.name })}
          </DialogTitle>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        </div>
        <FormError variant="inline" message={error} className="px-3 text-xs" />
        <IconOptions icon={look.icon} hue={look.hue} onPick={pick} />
      </DialogContent>
    </Dialog>
  )
}
