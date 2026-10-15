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
import { copyText, runAction } from "@/lib/feedback"
import { leaveShare, setStarred, trashPaste } from "@/lib/pastes/actions"
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${row.title}`}
        className="relative z-10 flex size-7 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/pastes/${row.slug}`} />}>
          <ExternalLinkIcon />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copyText(`${origin}/${row.slug}`)}>
          <LinkIcon />
          Copy link
        </DropdownMenuItem>
        {row.canEdit ? (
          <DropdownMenuItem render={<Link href={`/pastes/${row.slug}/edit`} />}>
            <PencilIcon />
            Edit
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href={`/new?from=${row.slug}`} />}>
          <CopyIcon />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            runAction(() => setStarred(row.slug, !row.starred), {
              success: row.starred ? "Removed from starred" : "Starred",
              error: "Couldn't update the star. Try again.",
            })
          }
        >
          {row.starred ? <StarOffIcon /> : <StarIcon />}
          {row.starred ? "Unstar" : "Star"}
        </DropdownMenuItem>
        {shared ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                runAction(() => leaveShare(row.slug), {
                  success: "Removed from your list",
                  error: "Couldn't remove it from your list. Try again.",
                })
              }
            >
              <LogOutIcon />
              Remove from my list
            </DropdownMenuItem>
          </>
        ) : null}
        {row.owner ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                runAction(() => trashPaste(row.slug), {
                  success: "Moved to trash",
                  error: "Couldn't move the paste to trash. Try again.",
                })
              }
            >
              <Trash2Icon />
              Move to trash
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
