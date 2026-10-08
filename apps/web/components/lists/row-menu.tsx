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
  MoreHorizontalIcon,
  PencilIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { setStarred, trashPaste } from "@/lib/pastes/actions"
import type { PasteRow } from "@/lib/pastes/rows"

export function RowMenu({ row, origin }: { row: PasteRow; origin: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${row.title}`}
        className="relative z-10 flex size-7 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/pastes/${row.slug}`} />}>
          <ExternalLinkIcon />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(`${origin}/${row.slug}`)}>
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
        <DropdownMenuItem onClick={() => setStarred(row.slug, !row.starred)}>
          {row.starred ? <StarOffIcon /> : <StarIcon />}
          {row.starred ? "Unstar" : "Star"}
        </DropdownMenuItem>
        {row.owner ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => trashPaste(row.slug)}>
              <Trash2Icon />
              Move to trash
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
