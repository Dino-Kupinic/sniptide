"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { cn } from "@sniptide/ui/lib/utils"
import {
  CopyIcon,
  FileCodeIcon,
  LinkIcon,
  MoreHorizontalIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { setStarred, trashPaste } from "@/lib/pastes/actions"
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
          setOptimistic(!optimistic)
          await setStarred(slug, !optimistic)
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
    <Button type="button" size="lg" className={className} onClick={() => copy(url)}>
      <LinkIcon />
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
    await copy(url)
  }

  return (
    <Button type="button" className={className} onClick={share}>
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </Button>
  )
}

export function PasteOverflowMenu({
  slug,
  canTrash,
  rawHref,
  className,
}: {
  slug: string
  canTrash: boolean
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
        {canTrash ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                await trashPaste(slug)
                router.push("/pastes")
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
