"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "@sniptide/ui/lib/utils"
import {
  CopyIcon,
  FileCodeIcon,
  LinkIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { withUndo } from "@/components/undo-toast"
import { track } from "@/lib/analytics"
import { runAction } from "@/lib/feedback"
import {
  leaveShare,
  restorePaste,
  restoreShare,
  setStarred,
  trashPaste,
} from "@/lib/pastes/actions"
import { useCopy } from "./copy-button"

export function StarButton({
  slug,
  starred,
  className,
  variant = "outline",
}: {
  slug: string
  starred: boolean
  className?: string
  variant?: "outline" | "ghost"
}) {
  const [optimistic, setOptimistic] = React.useOptimistic(starred)
  const [, startTransition] = React.useTransition()

  return (
    <Button
      type="button"
      variant={variant}
      size="icon-lg"
      aria-label={optimistic ? "Unstar" : "Star"}
      aria-pressed={optimistic}
      className={className}
      onClick={() =>
        startTransition(async () => {
          const next = !optimistic
          setOptimistic(next)
          await runAction(() => setStarred(slug, next), {
            success: next ? "Starred" : "Removed from starred",
            error: "Couldn't update the star. Try again.",
          })
        })
      }
    >
      <StarIcon className={cn(optimistic && "fill-current")} />
    </Button>
  )
}

export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const { copied, copy } = useCopy()

  return (
    <Button
      type="button"
      size="lg"
      className={className}
      onClick={() => {
        track("share_link_copied", { from: "paste" })
        return copy(url)
      }}
    >
      {copied ? <SuccessCheck /> : <LinkIcon />}
      <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
    </Button>
  )
}

// Mobile "Share" button: the native share sheet where there is one, otherwise copy the link.
export function ShareButton({
  url,
  title,
  className,
}: {
  url: string
  title: string
  className?: string
}) {
  const { copied, copy } = useCopy()

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url, title })
        return
      } catch {
        // Dismissed or unsupported for this payload; fall back to copying.
      }
    }
    track("share_link_copied", { from: "share_button" })
    await copy(url)
  }

  return (
    <Button type="button" className={className} onClick={share}>
      {copied ? <SuccessCheck /> : null}
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </Button>
  )
}

// Drops a paste someone shared with the viewer from their list, then goes back to it.
export function LeaveShareButton({
  slug,
  title,
  className,
}: {
  slug: string
  title: string
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await withUndo(() => leaveShare(slug), {
            error: "Couldn't remove it from your list. Try again.",
            message: `Removed “${title}” from your list`,
            undo: () => restoreShare(slug),
            onUndone: () => router.push(`/pastes/${slug}`),
          })
          if (result.ok) router.push("/shared")
        })
      }
    >
      Remove from my list
    </Button>
  )
}

export function PasteOverflowMenu({
  slug,
  title,
  canTrash,
  canLeave,
  rawHref,
  className,
}: {
  slug: string
  title: string
  canTrash: boolean
  // Shared with the viewer, so they can drop it from Shared with me.
  canLeave?: boolean
  rawHref?: string
  className?: string
}) {
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        className={cn(
          "inline-flex size-9 items-center justify-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
      >
        <MoreHorizontalIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/new?from=${slug}`} />}>
          <CopyIcon />
          Duplicate
        </DropdownMenuItem>
        {rawHref ? (
          <DropdownMenuItem render={<a href={rawHref} />}>
            <FileCodeIcon />
            View raw
          </DropdownMenuItem>
        ) : null}
        {canLeave ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                const result = await withUndo(() => leaveShare(slug), {
                  error: "Couldn't remove it from your list. Try again.",
                  message: `Removed “${title}” from your list`,
                  undo: () => restoreShare(slug),
                  onUndone: () => router.push(`/pastes/${slug}`),
                })
                if (result.ok) router.push("/shared")
              }}
            >
              <LogOutIcon />
              Remove from my list
            </DropdownMenuItem>
          </>
        ) : null}
        {canTrash ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                const result = await withUndo(() => trashPaste(slug), {
                  error: "Couldn't move the paste to trash. Try again.",
                  message: `Moved “${title}” to trash`,
                  undo: () => restorePaste(slug),
                  onUndone: () => router.push(`/pastes/${slug}`),
                })
                if (result.ok) router.push("/pastes")
              }}
            >
              <Trash2Icon />
              Move to trash
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
