import { ArrowRightIcon } from "lucide-react"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { useTranslations } from "next-intl"
import type * as React from "react"
import { type ComponentProps, Suspense } from "react"
import { FileViewer } from "@/components/paste/file-viewer"
import { RevealPaste } from "@/components/paste/reveal-paste"
import { SharedPasteView, sharedViewerProps } from "@/components/paste/shared-paste-view"
import { UnlockForm } from "@/components/paste/unlock-form"
import { PublicHeader } from "@/components/public-header"
import { highlightFiles } from "@/lib/highlight/highlight"
import { isHumanVisit } from "@/lib/pastes/hit"
import { previewMetadata } from "@/lib/pastes/preview"
import { previewVideoAvailable, warmPreviewVideo } from "@/lib/pastes/preview-video"
import { readPublicPreview, readSharedMeta, readSharedPaste } from "@/lib/pastes/store"
import { getAppOrigin, getSiteOrigin } from "@/lib/site"

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

// Public page for a paste at sniptide.com/<slug>, from the "Share page (public)" artboards. A
// password or burn-after-read setting applies to everyone who opens the link, its owner included.
export default async function Page({ params }: PageProps<"/[slug]">) {
  const { slug } = await params
  // Crawlers, link unfurlers, prefetches and scripts don't count as views.
  const read = await readSharedPaste(slug, { visit: isHumanVisit(await headers()) })
  if (read.status === "missing") notFound()

  const { signedIn } = read
  const ownerHref =
    read.status !== "ok" && read.owned ? `${getAppOrigin()}/pastes/${slug}` : undefined
  const signUp = signedIn ? null : <SignUpPrompt />

  if (read.status === "sealed") {
    return (
      <Shell signedIn={signedIn}>
        <RevealPaste slug={slug} ownerHref={ownerHref} after={signUp} />
      </Shell>
    )
  }

  if (read.status === "locked") {
    return (
      <Shell signedIn={signedIn}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <UnlockForm slug={slug} ownerHref={ownerHref} />
          {signUp}
        </div>
      </Shell>
    )
  }

  const { paste } = read
  const single = paste.files.length === 1
  const viewerProps = {
    slug,
    files: paste.files,
    rawAllowed: paste.allowRaw,
    ...sharedViewerProps(single, true),
  }

  return (
    <Shell signedIn={signedIn}>
      <SharedPasteView
        slug={slug}
        paste={paste}
        viewer={
          <Suspense fallback={<FileViewer {...viewerProps} />}>
            <HighlightedFileViewer {...viewerProps} />
          </Suspense>
        }
        after={signUp}
      />
    </Shell>
  )
}

function Shell({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader signedIn={signedIn} />
      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-4 px-4 pt-4 pb-6 lg:gap-6 lg:pt-12">
        {children}
      </main>
    </div>
  )
}

// Access and existence checks finish before streaming, preserving real HTTP 404s.
// Code stays readable while its syntax tokens are prepared.
async function HighlightedFileViewer({ files, ...props }: ComponentProps<typeof FileViewer>) {
  return <FileViewer {...props} files={await highlightFiles(files)} />
}

function SignUpPrompt() {
  const t = useTranslations("Core")
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
