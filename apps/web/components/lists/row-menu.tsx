"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import {
  CopyIcon,
  ExternalLinkIcon,
  LinkIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PencilIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { withUndo } from "@/components/undo-toast"
import { copyText, runAction } from "@/lib/feedback"
import {
  leaveShare,
  restorePaste,
  restoreShare,
  setStarred,
  trashPaste,
} from "@/lib/pastes/actions"
import type { PasteRow } from "@/lib/pastes/rows"

export function RowMenu({
  row,
  origin,
  shared,
}: {
  row: PasteRow
  origin: string
  // A row of Shared with me, which the viewer can drop from their list.
  shared?: boolean
}) {
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("actions_for", { name: row.title })}
        className="relative z-10 flex size-7 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/pastes/${row.slug}`} />}>
          <ExternalLinkIcon />
          {t("open")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            copyText(`${origin}/${row.slug}`, {
              success: feedbackT("linkCopied"),
              error: feedbackT("copyError"),
            })
          }
        >
          <LinkIcon />
          {t("copy_link")}
        </DropdownMenuItem>
        {row.canEdit ? (
          <DropdownMenuItem render={<Link href={`/pastes/${row.slug}/edit`} />}>
            <PencilIcon />
            {t("edit")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href={`/new?from=${row.slug}`} />}>
          <CopyIcon />
          {t("duplicate")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            runAction(() => setStarred(row.slug, !row.starred), {
              success: row.starred ? t("removed_from_starred") : t("starred"),
              error: t("couldnt_update_the_star_try_again"),
            })
          }
        >
          {row.starred ? <StarOffIcon /> : <StarIcon />}
          {row.starred ? t("unstar") : t("star")}
        </DropdownMenuItem>
        {shared ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                withUndo(() => leaveShare(row.slug), {
                  labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
                  error: t("couldnt_remove_it_from_your_list_try_again"),
                  message: t("removed_from_list", { name: row.title }),
                  undo: () => restoreShare(row.slug),
                })
              }
            >
              <LogOutIcon />
              {t("remove_from_my_list")}
            </DropdownMenuItem>
          </>
        ) : null}
        {row.owner ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                withUndo(() => trashPaste(row.slug), {
                  labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
                  error: t("couldnt_move_the_paste_to_trash_try_again"),
                  message: t("moved_to_trash", { name: row.title }),
                  undo: () => restorePaste(row.slug),
                })
              }
            >
              <Trash2Icon />
              {t("move_to_trash")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
