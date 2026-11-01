import { cn } from "@sniptide/ui/lib/utils"
import { ClockIcon, EyeIcon, FlameIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type * as React from "react"
import { byteLength, formatBytes, lineCount, timeAgo, timeUntil } from "@/lib/format"
import type { HighlightedLines } from "@/lib/highlight/types"
import { ActiveFileProvider, FileViewer } from "./file-viewer"
import { LanguageLabel } from "./language-icon"
import { ShareActions } from "./share-actions"

export interface SharedPasteViewData {
  title: string
  author: { username: string; initials: string; tone?: "primary" | "foreground" | "muted" }
  files: { name: string; language: string; content: string; lines?: HighlightedLines }[]
  updatedAt: number
  expiresAt: number | null
  views: number
  burnAfterRead: boolean
  allowRaw: boolean
}

const avatarTone = {
  primary: "bg-primary text-primary-foreground",
  foreground: "bg-foreground text-background",
  muted: "bg-muted text-foreground",
}

// The public share page body: who shared it, the title, the details line, the actions and the
// code card. Both the server-rendered share page and a burn-after-read paste revealed in the
// browser render this, so a revealed paste looks and highlights like every other one. `gone` marks
// a paste a reveal just used up, which drops Raw, Download and Print.
export function SharedPasteView({
  slug,
  gone = false,
  paste,
  notice,
  viewer,
  after,
}: {
  slug: string
  gone?: boolean
  paste: SharedPasteViewData
  // A line above the code card, such as the burn-after-read notice.
  notice?: React.ReactNode
  // Replaces the default code card, so the server page can stream highlighting in.
  viewer?: React.ReactNode
  // Below the code card, such as the sign-up prompt.
  after?: React.ReactNode
}) {
  const t = useTranslations("Core")
  const locale = useLocale()
  const { files, author } = paste
  const first = files[0]
  const lines = files.reduce((count, file) => count + lineCount(file.content), 0)
  const bytes = files.reduce((size, file) => size + byteLength(file.content), 0)
  const rawAllowed = !gone && paste.allowRaw
  const rawHref =
    rawAllowed && first ? `/${slug}/raw?file=${encodeURIComponent(first.name)}` : undefined
  const expires = paste.burnAfterRead
    ? t("deletedAfterView")
    : paste.expiresAt
      ? t("expires", { time: timeUntil(paste.expiresAt, Date.now(), locale) })
      : null

  return (
    <ActiveFileProvider>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
          <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 items-center justify-center rounded-md font-heading text-[10px] font-bold",
                avatarTone[author.tone ?? "foreground"],
              )}
            >
              {author.initials}
            </span>
            <span className="text-foreground">@{author.username}</span>
            {t("sharedTime", { time: timeAgo(paste.updatedAt, Date.now(), locale) })}
          </p>
          <h1 className="font-heading text-[32px] leading-10 font-bold tracking-[-0.03em] break-words lg:text-5xl lg:leading-[56px]">
            {paste.title}
          </h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {first ? (
              <LanguageLabel language={first.language} className="text-foreground/80" />
            ) : null}
            <span>{t("lineSize", { count: lines, size: formatBytes(bytes, locale) })}</span>
            {expires ? (
              <span className="inline-flex items-center gap-1.5">
                {paste.burnAfterRead ? (
                  <FlameIcon className="hidden size-3.5 lg:block" />
                ) : (
                  <ClockIcon className="hidden size-3.5 lg:block" />
                )}
                {expires}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <EyeIcon className="hidden size-3.5 lg:block" />
              {t("viewCount", { count: paste.views })}
            </span>
          </p>
        </div>
        {files.length === 1 && first ? (
          <div className="hidden shrink-0 lg:block">
            <ShareActions
              slug={gone ? undefined : slug}
              rawHref={rawHref}
              content={first.content}
            />
          </div>
        ) : null}
      </div>

      {notice}

      {viewer ?? (
        <FileViewer
          slug={slug}
          files={files}
          {...sharedViewerProps(files.length === 1, !gone)}
          rawAllowed={rawAllowed}
        />
      )}
      {after}
      {/* Phones keep the actions in reach in a bar at the bottom of the screen. */}
      {first ? (
        <div className="sticky bottom-0 z-20 -mx-4 mt-auto -mb-6 box-content flex h-14 flex-col justify-center border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden">
          <ShareActions
            slug={gone ? undefined : slug}
            rawHref={rawHref}
            content={first.content}
            compact
          />
        </div>
      ) : null}
    </ActiveFileProvider>
  )
}

// The code card's look on the share page, shared with the server page's streamed viewer.
export function sharedViewerProps(single: boolean, printable: boolean) {
  return {
    collapseAt: 6,
    printable,
    headerClassName: single ? "lg:hidden" : undefined,
    bodyClassName: cn("bg-sidebar", single && "lg:py-5"),
  }
}

// Above the code of a revealed burn-after-read paste: it's gone for good, so the reader knows to
// copy what they need before leaving.
export function BurnNotice() {
  const t = useTranslations("Paste")
  return (
    <p
      role="status"
      className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm text-foreground"
    >
      <FlameIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-highlight" />
      <span>{t("thisPasteWasSetToBurn")}</span>
    </p>
  )
}
