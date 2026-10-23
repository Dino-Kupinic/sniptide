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
import { useTranslations } from "next-intl"
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
  const t = useTranslations("Paste")
  const [optimistic, setOptimistic] = React.useOptimistic(starred)
  const [, startTransition] = React.useTransition()

  return (
    <Button
      type="button"
      variant={variant}
      size="icon-lg"
      aria-label={optimistic ? t("unstar") : t("star")}
      aria-pressed={optimistic}
      className={className}
      onClick={() =>
        startTransition(async () => {
          const next = !optimistic
          setOptimistic(next)
          await runAction(() => setStarred(slug, next), {
            success: next ? t("starred") : t("removedFromStarred"),
            error: t("couldnTUpdateTheStarTry"),
          })
        })
      }
    >
      <StarIcon className={cn(optimistic && "fill-current")} />
    </Button>
  )
}

export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const t = useTranslations("Paste")
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
      <span aria-live="polite">{copied ? t("copied") : t("copyLink")}</span>
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
  const t = useTranslations("Paste")
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
      <span aria-live="polite">{copied ? t("linkCopied") : t("share")}</span>
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
  const t = useTranslations("Paste")
  const feedbackT = useTranslations("Core")
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
            labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
            error: t("couldnTRemoveItFromYour"),
            message: t("removedFromList", { title }),
            undo: () => restoreShare(slug),
            onUndone: () => router.push(`/pastes/${slug}`),
          })
          if (result.ok) router.push("/shared")
        })
      }
    >
      {t("removeFromMyList")}
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
  const t = useTranslations("Paste")
  const feedbackT = useTranslations("Core")
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("moreActions")}
        className={cn(
          "rounded-lg inline-flex size-9 items-center justify-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
      >
        <MoreHorizontalIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/new?from=${slug}`} />}>
          <CopyIcon />
          {t("duplicate")}
        </DropdownMenuItem>
        {rawHref ? (
          <DropdownMenuItem render={<a href={rawHref} />}>
            <FileCodeIcon />
            {t("viewRaw")}
          </DropdownMenuItem>
        ) : null}
        {canLeave ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                const result = await withUndo(() => leaveShare(slug), {
                  labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
                  error: t("couldnTRemoveItFromYour"),
                  message: t("removedFromList", { title }),
                  undo: () => restoreShare(slug),
                  onUndone: () => router.push(`/pastes/${slug}`),
                })
                if (result.ok) router.push("/shared")
              }}
            >
              <LogOutIcon />
              {t("removeFromMyList")}
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
                  labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
                  error: t("couldnTMoveThePasteTo"),
                  message: t("movedToTrash", { title }),
                  undo: () => restorePaste(slug),
                  onUndone: () => router.push(`/pastes/${slug}`),
                })
                if (result.ok) router.push("/pastes")
              }}
            >
              <Trash2Icon />
              {t("moveToTrash")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
