"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@sniptide/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import {
  CheckIcon,
  CopyIcon,
  FolderIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PlusIcon,
  ShareIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { CollectionIcon } from "@/components/collections/icon"
import { NewCollectionDialog } from "@/components/collections/new-collection"
import { useSiteHost } from "@/components/site-host"
import { withUndo } from "@/components/undo-toast"
import { track } from "@/lib/analytics"
import type { Collection } from "@/lib/collections/types"
import { copyText, runAction } from "@/lib/feedback"
import {
  renamePaste,
  restorePaste,
  setPasteCollection,
  setStarred,
  trashPaste,
} from "@/lib/pastes/actions"
import type { SidebarPaste } from "@/lib/pastes/types"

// The ⋯ menu on a sidebar paste row. Renaming, filing and deleting only apply to the viewer's own
// pastes; a starred paste someone else owns gets Star, Share and Copy link.
export function PasteMenu({
  paste,
  collections,
  className,
}: {
  paste: SidebarPaste
  collections: Collection[]
  className?: string
}) {
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  const router = useRouter()
  const pathname = usePathname()
  const host = useSiteHost()
  const [renaming, setRenaming] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [, startTransition] = React.useTransition()

  // Files the paste in `collection`, or takes it out of its current one with null. Undo puts it
  // back where it was.
  function fileIn(collection: string | null) {
    const previous = paste.collection
    const nameOf = (slug: string | null) =>
      collections.find((candidate) => candidate.slug === slug)?.name
    startTransition(async () => {
      await withUndo(() => setPasteCollection(paste.slug, collection), {
        labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
        error: t("couldnt_update_the_collection_try_again"),
        message: collection
          ? t("moved_to_collection", { name: nameOf(collection) ?? t("new_collection_fallback") })
          : t("removed_from_collection", { name: nameOf(previous) ?? t("collection_fallback") }),
        undo: () => setPasteCollection(paste.slug, previous),
      })
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("actions_for", { name: paste.title })}
          className={className}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-56">
          {paste.owned ? (
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <PencilLineIcon />
              {t("rename")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() =>
              startTransition(async () => {
                await runAction(() => setStarred(paste.slug, !paste.starred), {
                  success: paste.starred ? t("removed_from_starred") : t("starred"),
                  error: t("couldnt_update_the_star_try_again"),
                })
              })
            }
          >
            {paste.starred ? <StarOffIcon /> : <StarIcon />}
            {paste.starred ? t("unstar") : t("star")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/pastes/${paste.slug}#sharing-heading`)}>
            <ShareIcon />
            {t("share")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              track("share_link_copied", { from: "menu" })
              return copyText(`${window.location.protocol}//${host}/${paste.slug}`, {
                success: feedbackT("linkCopied"),
                error: feedbackT("copyError"),
              })
            }}
          >
            <CopyIcon />
            {t("copy_link")}
          </DropdownMenuItem>
          {paste.owned ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderIcon />
                {t("add_to_collection")}
              </DropdownMenuSubTrigger>
              <DropdownMenuContent className="w-52">
                {collections.map((collection) => {
                  const filed = paste.collection === collection.slug
                  return (
                    <DropdownMenuItem
                      key={collection.slug}
                      onClick={() => fileIn(filed ? null : collection.slug)}
                      className="font-mono text-[13px]"
                    >
                      <CollectionIcon
                        icon={collection.icon}
                        hue={collection.hue}
                        className="size-3"
                      />
                      <span className="truncate">{collection.name}</span>
                      {filed ? <CheckIcon className="ml-auto text-primary!" /> : null}
                    </DropdownMenuItem>
                  )
                })}
                {collections.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onClick={() => setCreating(true)}>
                  <PlusIcon />
                  {t("new_collection")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuSub>
          ) : null}
          {paste.owned ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  startTransition(async () => {
                    const onItsPage = pathname.startsWith(`/pastes/${paste.slug}`)
                    const result = await withUndo(() => trashPaste(paste.slug), {
                      labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
                      error: t("couldnt_move_the_paste_to_trash_try_again"),
                      message: t("moved_to_trash", { name: paste.title }),
                      undo: () => restorePaste(paste.slug),
                      onUndone: () => {
                        if (onItsPage) router.push(`/pastes/${paste.slug}`)
                      },
                    })
                    // Its own page has nothing left to show.
                    if (result.ok && onItsPage) router.push("/pastes")
                  })
                }
              >
                <Trash2Icon className="text-destructive!" />
                {t("delete")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {paste.owned ? (
        <>
          <RenamePasteDialog paste={paste} open={renaming} onOpenChange={setRenaming} />
          <NewCollectionDialog
            existing={collections.length}
            open={creating}
            onOpenChange={setCreating}
            onCreated={(slug) => fileIn(slug)}
          />
        </>
      ) : null}
    </>
  )
}

function RenamePasteDialog({
  paste,
  open,
  onOpenChange,
}: {
  paste: SidebarPaste
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Workspace")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        setError(null)
      }}
    >
      <DialogContent>
        <DialogTitle>{t("rename_paste")}</DialogTitle>
        <DialogDescription>{t("only_the_title_changes_the_link_stays_the")}</DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const title = String(new FormData(event.currentTarget).get("title") ?? "")
            startTransition(async () => {
              try {
                const result = await renamePaste(paste.slug, title)
                if (!result.ok) return setError(result.error)
              } catch {
                return setError(t("couldnt_rename_the_paste_try_again"))
              }
              onOpenChange(false)
            })
          }}
        >
          <Input
            key={paste.title}
            name="title"
            aria-label={t("title")}
            defaultValue={paste.title}
            maxLength={120}
            autoComplete="off"
            required
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            aria-invalid={Boolean(error)}
            className="h-10 text-base lg:text-sm"
          />
          <FormError variant="inline" message={error} />
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit" size="lg" loading={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
