"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import {
  ArchiveRestoreIcon,
  ChevronDownIcon,
  FolderInputIcon,
  FolderMinusIcon,
  FolderPlusIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  LogOutIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { CollectionIcon } from "@/components/collections/icon"
import { NewCollectionDialog } from "@/components/collections/new-collection"
import { withUndo } from "@/components/undo-toast"
import type { Collection } from "@/lib/collections/types"
import { runAction } from "@/lib/feedback"
import {
  leaveShares,
  restorePastes,
  restoreShares,
  setPastesCollection,
  setPastesStarred,
  setPastesVisibility,
  trashPastes,
} from "@/lib/pastes/actions"
import type { PasteRow } from "@/lib/pastes/rows"
import type { Visibility } from "@/lib/pastes/types"
import type { RowSelection } from "./selection"

// Undo for a change whose old value differs per row: each group of rows goes back to its own value.
function groupBy<T, K>(items: T[], key: (item: T) => K) {
  const groups = new Map<K, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return [...groups]
}

function useLabels() {
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  return {
    labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
    error: t("couldnt_update_the_selection_try_again"),
  }
}

// One action in the selection bar: a small flat button with an icon and a label.
function BarButton({
  icon: Icon,
  label,
  destructive = false,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "variant" | "size"> & {
  icon: React.ComponentType<{ className?: string }>
  label: string
  destructive?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={destructive ? "text-destructive hover:text-destructive" : undefined}
      {...props}
    >
      <Icon />
      {label}
    </Button>
  )
}

function BarMenu({
  icon: Icon,
  label,
  disabled,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={<Button variant="ghost" size="sm" className="data-popup-open:bg-muted" />}
      >
        <Icon />
        {label}
        <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" sideOffset={8}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The selection bar's actions for My pastes, a collection's page and Starred. Changes to a paste
// itself (its collection, visibility or trash) apply to the viewer's own pastes only, so rows
// someone shared are skipped and the buttons hide when only such rows are checked.
export function PasteBulkActions({
  rows,
  selection,
  mode,
  collections,
  collection: current,
}: {
  rows: PasteRow[]
  selection: RowSelection
  mode: "mine" | "starred" | "collection"
  collections: Collection[]
  // The collection whose page this is.
  collection?: string
}) {
  const t = useTranslations("Workspace")
  const { labels, error } = useLabels()
  const [pending, startTransition] = React.useTransition()
  const [creating, setCreating] = React.useState(false)
  const selected = rows.filter((row) => selection.has(row.slug))
  const owned = selected.filter((row) => !row.owner)
  const slugs = (list: PasteRow[]) => list.map((row) => row.slug)
  const run = (action: () => Promise<unknown>) => startTransition(async () => void (await action()))

  const unstarred = selected.filter((row) => !row.starred)
  const star = () =>
    run(() =>
      unstarred.length > 0
        ? withUndo(() => setPastesStarred(slugs(unstarred), true), {
            labels,
            error,
            message: t("bulk_starred", { count: unstarred.length }),
            undo: () => setPastesStarred(slugs(unstarred), false),
          })
        : withUndo(() => setPastesStarred(slugs(selected), false), {
            labels,
            error,
            message: t("bulk_unstarred", { count: selected.length }),
            undo: () => setPastesStarred(slugs(selected), true),
          }),
    )

  const move = (target: Pick<Collection, "slug" | "name"> | null) => {
    const moving = owned.filter((row) => row.collection !== (target?.slug ?? null))
    if (moving.length === 0) return
    run(() =>
      withUndo(() => setPastesCollection(slugs(moving), target?.slug ?? null), {
        labels,
        error,
        message: target
          ? t("bulk_moved_to_collection", { count: moving.length, name: target.name })
          : t("bulk_removed_from_collection", { count: moving.length }),
        undo: async () => {
          for (const [collection, group] of groupBy(moving, (row) => row.collection)) {
            const result = await setPastesCollection(slugs(group), collection)
            if (!result.ok) return result
          }
          return { ok: true }
        },
      }),
    )
  }

  const visibility = (next: Visibility) => {
    const changing = owned.filter((row) => row.visibility !== next)
    if (changing.length === 0) return
    run(() =>
      withUndo(() => setPastesVisibility(slugs(changing), next), {
        labels,
        error,
        message: t("bulk_visibility_changed", { count: changing.length, visibility: next }),
        undo: async () => {
          for (const [previous, group] of groupBy(changing, (row) => row.visibility))
            await setPastesVisibility(slugs(group), previous)
        },
      }),
    )
  }

  const trash = () =>
    run(() =>
      withUndo(() => trashPastes(slugs(owned)), {
        labels,
        error,
        message: t("bulk_moved_to_trash", { count: owned.length }),
        undo: () => restorePastes(slugs(owned)),
      }),
    )

  if (mode === "starred")
    return <BarButton icon={StarOffIcon} label={t("unstar")} disabled={pending} onClick={star} />

  return (
    <>
      <BarButton
        icon={unstarred.length > 0 ? StarIcon : StarOffIcon}
        label={unstarred.length > 0 ? t("star") : t("unstar")}
        disabled={pending}
        onClick={star}
      />
      {owned.length > 0 ? (
        <>
          <BarMenu icon={FolderInputIcon} label={t("move_to_collection")} disabled={pending}>
            {collections
              .filter((item) => item.slug !== current)
              .map((item) => (
                <DropdownMenuItem
                  key={item.slug}
                  onClick={() => move(item)}
                  className="font-mono text-[13px]"
                >
                  <CollectionIcon icon={item.icon} hue={item.hue} className="size-3" />
                  <span className="truncate">{item.name}</span>
                </DropdownMenuItem>
              ))}
            {collections.length > (current ? 1 : 0) ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={() => setCreating(true)}>
              <FolderPlusIcon />
              {t("new_collection")}
            </DropdownMenuItem>
            {owned.some((row) => row.collection) ? (
              <DropdownMenuItem onClick={() => move(null)}>
                <FolderMinusIcon />
                {t("remove_from_collection")}
              </DropdownMenuItem>
            ) : null}
          </BarMenu>
          {/* A new collection made from the bar takes the checked pastes straight away. */}
          <NewCollectionDialog
            open={creating}
            onOpenChange={setCreating}
            existing={collections.length}
            onCreated={(slug, name) => {
              setCreating(false)
              move({ slug, name: name.trim() })
            }}
          />
          <BarMenu icon={GlobeIcon} label={t("visibility")} disabled={pending}>
            <DropdownMenuItem onClick={() => visibility("public")}>
              <GlobeIcon />
              {t("public")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => visibility("unlisted")}>
              <LinkIcon />
              {t("unlisted")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => visibility("private")}>
              <LockIcon />
              {t("private")}
            </DropdownMenuItem>
          </BarMenu>
          <BarButton
            icon={Trash2Icon}
            label={t("move_to_trash")}
            destructive
            disabled={pending}
            onClick={trash}
          />
        </>
      ) : null}
    </>
  )
}

// Shared with me: star the checked pastes, or drop them from the list.
export function SharedBulkActions({
  rows,
  selection,
}: {
  rows: PasteRow[]
  selection: RowSelection
}) {
  const t = useTranslations("Workspace")
  const { labels, error } = useLabels()
  const [pending, startTransition] = React.useTransition()
  const selected = rows.filter((row) => selection.has(row.slug)).map((row) => row.slug)
  const unstarred = rows.filter((row) => selection.has(row.slug) && !row.starred)
  const run = (action: () => Promise<unknown>) => startTransition(async () => void (await action()))

  return (
    <>
      <BarButton
        icon={unstarred.length > 0 ? StarIcon : StarOffIcon}
        label={unstarred.length > 0 ? t("star") : t("unstar")}
        disabled={pending}
        onClick={() => {
          const starring = unstarred.length > 0
          const slugs = starring ? unstarred.map((row) => row.slug) : selected
          run(() =>
            withUndo(() => setPastesStarred(slugs, starring), {
              labels,
              error,
              message: starring
                ? t("bulk_starred", { count: slugs.length })
                : t("bulk_unstarred", { count: slugs.length }),
              undo: () => setPastesStarred(slugs, !starring),
            }),
          )
        }}
      />
      <BarButton
        icon={LogOutIcon}
        label={t("remove_from_my_list")}
        destructive
        disabled={pending}
        onClick={() =>
          run(() =>
            withUndo(() => leaveShares(selected), {
              labels,
              error,
              message: t("bulk_removed_from_list", { count: selected.length }),
              undo: () => restoreShares(selected),
            }),
          )
        }
      />
    </>
  )
}

// Trash: restore the checked pastes, or delete them for good behind the confirmation `onDelete`
// opens.
export function TrashBulkActions({
  selection,
  onDelete,
}: {
  selection: RowSelection
  onDelete: () => void
}) {
  const t = useTranslations("Workspace")
  const [pending, startTransition] = React.useTransition()
  return (
    <>
      <BarButton
        icon={ArchiveRestoreIcon}
        label={t("restore")}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const count = selection.count
            await runAction(() => restorePastes(selection.keys), {
              success: t("bulk_restored", { count }),
              error: t("couldnt_restore_the_paste_try_again"),
            })
          })
        }
      />
      <BarButton
        icon={Trash2Icon}
        label={t("delete_forever")}
        destructive
        disabled={pending}
        onClick={onDelete}
      />
    </>
  )
}
