import { Stripes } from "@sniptide/ui/components/stripes"
import { cn } from "@sniptide/ui/lib/utils"
import { ArrowRightIcon, ClockIcon, EyeIcon } from "lucide-react"
import { notFound } from "next/navigation"
import { CodeBlock } from "@/components/paste/code-block"
import { FileViewer } from "@/components/paste/file-viewer"
import { LanguageLabel } from "@/components/paste/language-marker"
import { ShareActions } from "@/components/paste/share-actions"
import { UnlockForm } from "@/components/paste/unlock-form"
import { PublicHeader } from "@/components/public-header"
import { byteLength, formatBytes, formatNumber, lineCount, timeAgo, timeUntil } from "@/lib/format"
import { checkAccess } from "@/lib/pastes/access"
import { getPaste, recordView } from "@/lib/pastes/store"
import { getAppOrigin } from "@/lib/site"

const avatarTone = {
  primary: "bg-primary text-primary-foreground",
  foreground: "bg-foreground text-background",
  muted: "bg-muted text-foreground",
}

export async function generateMetadata({ params }: PageProps<"/[slug]">) {
  const paste = await getPaste((await params).slug)
  if (!paste || paste.visibility === "private" || paste.password) return { title: "Sniptide" }

  return {
    title: `${paste.title} · Sniptide`,
    // Unlisted pastes are reachable by link only, so keep them out of search engines.
    robots: paste.visibility === "public" ? undefined : { index: false, follow: false },
  }
}

// Public page for a paste at sniptide.com/<slug>, from the "Share page (public)" artboards.
export default async function Page({ params }: PageProps<"/[slug]">) {
  const { slug } = await params
  const paste = await getPaste(slug)
  const access = await checkAccess(paste)
  if (!paste || access.status === "missing") notFound()

  const signedIn = access.status === "ok" && access.signedIn

  if (access.status === "locked") {
    return (
      <div className="flex min-h-svh flex-col">
        <PublicHeader signedIn={false} />
        <main className="flex flex-1 items-center justify-center p-4">
          <UnlockForm slug={slug} />
        </main>
        <StripeBand />
      </div>
    )
  }

  // The owner's own visits don't count as views (or burn the paste).
  const owned = access.status === "ok" && access.owned
  const burning = paste.burnAfterRead && !owned
  if (!owned) await recordView(slug)

  const owner = paste.author
  const first = paste.files[0]
  const lines = paste.files.reduce((count, file) => count + lineCount(file.content), 0)
  const bytes = paste.files.reduce((size, file) => size + byteLength(file.content), 0)
  const rawHref =
    paste.allowRaw && first ? `/${slug}/raw?file=${encodeURIComponent(first.name)}` : undefined
  const expires = burning
    ? "Deleted after this view"
    : paste.expiresAt
      ? `Expires ${timeUntil(paste.expiresAt)}`
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
                  "flex size-7 items-center justify-center font-heading text-[10px] font-bold",
                  avatarTone[owner.tone],
                )}
              >
                {owner.initials}
              </span>
              <span className="text-foreground">@{owner.username}</span>
              shared {timeAgo(paste.updatedAt).replace("min ago", "minutes ago")}
            </p>
            <h1 className="font-heading text-[32px] leading-10 font-bold tracking-[-0.03em] lg:text-5xl lg:leading-[56px]">
              {paste.title}
            </h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              {first ? (
                <LanguageLabel language={first.language} className="text-foreground/80" />
              ) : null}
              <span className="hidden lg:inline">
                {formatNumber(lines)} lines · {formatBytes(bytes)}
              </span>
              {expires ? (
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="hidden size-3.5 lg:block" />
                  {expires}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <EyeIcon className="hidden size-3.5 lg:block" />
                {formatNumber(paste.views)} views
              </span>
            </p>
          </div>
          {paste.files.length === 1 && first ? (
            <div className="hidden shrink-0 lg:block">
              <ShareActions rawHref={rawHref} content={first.content} />
            </div>
          ) : null}
        </div>

        {burning ? (
          <p className="border border-primary bg-primary/5 px-3 py-2 text-[13px] text-primary">
            This paste was set to burn after reading. It's gone once you leave this page, so copy
            what you need now.
          </p>
        ) : null}

        <div className="hidden flex-col gap-4 lg:flex">
          {paste.files.length === 1 && first ? (
            <CodeBlock content={first.content} className="border border-border bg-sidebar py-5" />
          ) : (
            <FileViewer
              slug={slug}
              files={paste.files}
              rawAllowed={paste.allowRaw}
              bodyClassName="bg-sidebar"
            />
          )}
        </div>
        <FileViewer
          slug={slug}
          files={paste.files}
          rawAllowed={paste.allowRaw}
          collapseAt={6}
          className="lg:hidden"
          bodyClassName="bg-sidebar"
        />

        <div className="mt-auto flex flex-col gap-3 lg:mt-0 lg:flex-row lg:items-center lg:justify-between">
          {first ? (
            <div className="lg:hidden">
              <ShareActions rawHref={rawHref} content={first.content} compact />
            </div>
          ) : null}
          {signedIn ? null : (
            <p className="text-center text-[13px] text-muted-foreground lg:text-left">
              Shared with Sniptide.{" "}
              <a
                href={`${getAppOrigin()}/sign-up`}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Create a free account
                <ArrowRightIcon className="size-3.5" />
              </a>
            </p>
          )}
        </div>
      </main>

      <StripeBand />
    </div>
  )
}

function StripeBand() {
  return (
    <div aria-hidden="true" className="relative h-14 shrink-0 overflow-hidden lg:h-[72px]">
      <Stripes className="-top-[360px] left-0 h-[900px] w-[720px] lg:w-full" />
    </div>
  )
}
