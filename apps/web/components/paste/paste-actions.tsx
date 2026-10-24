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
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import {
  CopyIcon,
  DownloadIcon,
  FileCodeIcon,
  LinkIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PrinterIcon,
  ShareIcon,
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
import { reportCopy, useCopy } from "./copy-button"
import { useActiveFile } from "./file-viewer"

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
      <StarIcon className={cn(optimistic && "fill-highlight text-highlight")} />
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

// Opens the native share sheet where there is one, otherwise copies the link. `icon` is the
// mobile header's version for people who can't open the owner's Share dialog.
export function useNativeShare(url: string, title: string, from: string) {
  const { copied, copy } = useCopy()
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url, title })
        return
      } catch (error) {
        // Dismissed: nothing more to do. Unsupported for this payload: fall back to copying.
        if (error instanceof DOMException && error.name === "AbortError") return
      }
    }
    track("share_link_copied", { from })
    await copy(url)
  }
  return { copied, share }
}

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
  const { copied, share } = useNativeShare(url, title, "share_button")
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={copied ? t("linkCopied") : t("share")}
      className={className}
      onClick={share}
    >
      {copied ? <SuccessCheck /> : <ShareIcon />}
    </Button>
  )
}

// The mobile bottom bar's primary action: copies the file open in the code card.
export function CopyCodeButton({ slug, className }: { slug: string; className?: string }) {
  const t = useTranslations("Paste")
  const file = useActiveFile()
  const { copied, copy } = useCopy()
  return (
    <Button
      type="button"
      size="xl"
      className={className}
      disabled={!file}
      onClick={async () => {
        if (file && (await copy(file.content))) reportCopy(slug)
      }}
    >
      {copied ? <SuccessCheck /> : <CopyIcon />}
      <span aria-live="polite">{copied ? t("copied") : t("copyCode")}</span>
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
  rawAllowed,
  url,
  className,
}: {
  slug: string
  title: string
  canTrash: boolean
  // Shared with the viewer, so they can drop it from Shared with me.
  canLeave?: boolean
  // View raw and Download, for the file open in the code card.
  rawAllowed?: boolean
  url: string
  className?: string
}) {
  const t = useTranslations("Paste")
  const feedbackT = useTranslations("Core")
  const router = useRouter()
  const file = useActiveFile()
  const { copy } = useCopy()
  const rawHref =
    rawAllowed && file ? `/${slug}/raw?file=${encodeURIComponent(file.name)}` : undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("moreActions")}
        className={cn(
          "rounded-lg inline-flex size-10 items-center justify-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/new?from=${slug}`} />}>
          <CopyIcon />
          {t("duplicate")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            track("share_link_copied", { from: "overflow_menu" })
            if (await copy(url)) toast.success(t("linkCopied"))
          }}
        >
          <LinkIcon />
          {t("copyLink")}
        </DropdownMenuItem>
        {rawHref && file ? (
          <>
            <DropdownMenuItem render={<a href={rawHref} />}>
              <FileCodeIcon />
              {t("viewRaw")}
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={`${rawHref}&download=1`} />}>
              <DownloadIcon />
              {t("downloadFile", { name: file.name })}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem render={<a href={`/${slug}/print`} target="_blank" rel="noopener" />}>
          <PrinterIcon />
          {t("print")}
        </DropdownMenuItem>
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
