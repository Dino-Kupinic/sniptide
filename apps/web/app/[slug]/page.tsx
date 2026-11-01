import { cn } from "@sniptide/ui/lib/utils"
import { ArrowRightIcon, ClockIcon, EyeIcon } from "lucide-react"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { type ComponentProps, Suspense } from "react"
import { ActiveFileProvider, FileViewer } from "@/components/paste/file-viewer"
import { LanguageLabel } from "@/components/paste/language-icon"
import { RevealPaste } from "@/components/paste/reveal-paste"
import { ShareActions } from "@/components/paste/share-actions"
import { UnlockForm } from "@/components/paste/unlock-form"
import { PublicHeader } from "@/components/public-header"
import { byteLength, formatBytes, lineCount, timeAgo, timeUntil } from "@/lib/format"
import { highlightFiles } from "@/lib/highlight/highlight"
import { isHumanVisit } from "@/lib/pastes/hit"
import { previewMetadata } from "@/lib/pastes/preview"
import { previewVideoAvailable, warmPreviewVideo } from "@/lib/pastes/preview-video"
import { readPublicPreview, readSharedMeta, readSharedPaste } from "@/lib/pastes/store"
import { getAppOrigin, getSiteOrigin } from "@/lib/site"

const avatarTone = {
  primary: "bg-primary text-primary-foreground",
  foreground: "bg-foreground text-background",
  muted: "bg-muted text-foreground",
}

export async function generateMetadata({ params }: PageProps<"/[slug]">) {
  const { slug } = await params
  const preview = await readPublicPreview(slug)
  if (preview) {
    const video = await previewVideoAvailable()
    // Whoever opens the paste first starts its video, so it is usually ready by the time a link
    // to it is shared.
    if (video) warmPreviewVideo(preview)
    return previewMetadata(preview, (await getSiteOrigin()).origin, { video })
  }
  const meta = await readSharedMeta(slug)
  if (!meta) return { title: "Sniptide", robots: { index: false, follow: false } }

  return {
    title: `${meta.title} · Sniptide`,
    // Unlisted pastes are reachable by link only, so keep them out of search engines.
    robots: meta.visibility === "public" ? undefined : { index: false, follow: false },
  }
}

// Public page for a paste at sniptide.com/<slug>, from the "Share page (public)" artboards.
export default async function Page({ params }: PageProps<"/[slug]">) {
  const { slug } = await params
  const [t, locale] = await Promise.all([getTranslations("Core"), getLocale()])
  // Crawlers, link unfurlers, prefetches and scripts don't count as views.
  const read = await readSharedPaste(slug, { visit: isHumanVisit(await headers()) })
  if (read.status === "missing") notFound()

  if (read.status === "sealed") {
    return (
      <div className="flex min-h-svh flex-col">
        <PublicHeader signedIn={read.signedIn} />
        <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col justify-center gap-6 px-4 pt-4 pb-6 lg:pt-12">
          <RevealPaste slug={slug} />
          {read.signedIn ? null : <SignUpPrompt />}
        </main>
      </div>
    )
  }

  if (read.status === "locked") {
    return (
      <div className="flex min-h-svh flex-col">
        <PublicHeader signedIn={false} />
        <main className="flex flex-1 items-center justify-center p-4">
          <UnlockForm slug={slug} />
        </main>
      </div>
    )
  }

  // Only the owner gets here with a burn-after-read paste; everyone else sees it sealed above.
  const { paste, signedIn } = read
  const rawAllowed = paste.allowRaw

  const owner = paste.author
  const files = paste.files
  const first = files[0]
  const single = files.length === 1
  const lines = paste.files.reduce((count, file) => count + lineCount(file.content), 0)
  const bytes = paste.files.reduce((size, file) => size + byteLength(file.content), 0)
  const rawHref =
    rawAllowed && first ? `/${slug}/raw?file=${encodeURIComponent(first.name)}` : undefined
  const expires = paste.burnAfterRead
    ? t("deletedAfterView")
    : paste.expiresAt
      ? t("expires", { time: timeUntil(paste.expiresAt, Date.now(), locale) })
      : null

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader signedIn={signedIn} />

      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-4 px-4 pt-4 pb-6 lg:gap-6 lg:pt-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
            <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 items-center justify-center rounded-md font-heading text-[10px] font-bold",
                  avatarTone[owner.tone],
                )}
              >
                {owner.initials}
              </span>
              <span className="text-foreground">@{owner.username}</span>
              {t("sharedTime", { time: timeAgo(paste.updatedAt, Date.now(), locale) })}
            </p>
            <h1 className="font-heading text-[32px] leading-10 font-bold tracking-[-0.03em] lg:text-5xl lg:leading-[56px]">
              {paste.title}
            </h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              {first ? (
                <LanguageLabel language={first.language} className="text-foreground/80" />
              ) : null}
              <span>{t("lineSize", { count: lines, size: formatBytes(bytes, locale) })}</span>
              {expires ? (
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="hidden size-3.5 lg:block" />
                  {expires}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <EyeIcon className="hidden size-3.5 lg:block" />
                {t("viewCount", { count: paste.views })}
              </span>
            </p>
          </div>
          {paste.files.length === 1 && first ? (
            <div className="hidden shrink-0 lg:block">
              <ShareActions slug={slug} rawHref={rawHref} content={first.content} />
            </div>
          ) : null}
        </div>

        <ActiveFileProvider>
          <Suspense
            fallback={
              <FileViewer
                slug={slug}
                files={files}
                rawAllowed={rawAllowed}
                collapseAt={6}
                printable
                headerClassName={single ? "lg:hidden" : undefined}
                bodyClassName={cn("bg-sidebar", single && "lg:py-5")}
              />
            }
          >
            <HighlightedFileViewer
              slug={slug}
              files={files}
              rawAllowed={rawAllowed}
              collapseAt={6}
              printable
              headerClassName={single ? "lg:hidden" : undefined}
              bodyClassName={cn("bg-sidebar", single && "lg:py-5")}
            />
          </Suspense>
          {signedIn ? null : <SignUpPrompt />}
          {/* Phones keep the actions in reach in a bar at the bottom of the screen. */}
          {first ? (
            <div className="sticky bottom-0 z-20 -mx-4 mt-auto -mb-6 box-content flex h-14 flex-col justify-center border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden">
              <ShareActions slug={slug} rawHref={rawHref} content={first.content} compact />
            </div>
          ) : null}
        </ActiveFileProvider>
      </main>
    </div>
  )
}

// Access and existence checks finish before streaming, preserving real HTTP 404s.
// Code stays readable while its syntax tokens are prepared.
async function HighlightedFileViewer({ files, ...props }: ComponentProps<typeof FileViewer>) {
  return <FileViewer {...props} files={await highlightFiles(files)} />
}

async function SignUpPrompt() {
  const t = await getTranslations("Core")
  return (
    <p className="text-center text-[13px] text-muted-foreground lg:text-left">
      {t("sharedWithSniptide")}{" "}
      <a
        href={`${getAppOrigin()}/sign-up`}
        className="inline-flex items-center gap-1 font-medium text-link hover:underline"
      >
        {t("createFree")}
        <ArrowRightIcon className="size-3.5" />
      </a>
    </p>
  )
}
