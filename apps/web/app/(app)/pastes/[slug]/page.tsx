import { Button } from "@sniptide/ui/components/button"
import { ChevronLeftIcon, CopyIcon, PencilIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FileViewer } from "@/components/paste/file-viewer"
import { LanguageLabel } from "@/components/paste/language-marker"
import {
  CopyLinkButton,
  PasteOverflowMenu,
  ShareButton,
  StarButton,
} from "@/components/paste/paste-actions"
import { SettingRow, ShareLinkField, SharingPanel } from "@/components/paste/sharing-panel"
import { ViewsSparkline } from "@/components/paste/views-chart"
import { VisibilityBadge } from "@/components/paste/visibility-badge"
import { SetBreadcrumb } from "@/components/shell/breadcrumb"
import { getPreferences } from "@/lib/auth"
import {
  byteLength,
  formatBytes,
  formatDateTime,
  formatNumber,
  lineCount,
  timeAgo,
} from "@/lib/format"
import { highlightFiles } from "@/lib/highlight/highlight"
import { collections } from "@/lib/mock-data"
import { getOwnPaste, getShare, isStarred, markShareSeen } from "@/lib/pastes/store"
import type { Paste } from "@/lib/pastes/types"
import { indentLabel } from "@/lib/preferences"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/pastes/[slug]">) {
  const paste = await getOwnPaste((await params).slug)
  return { title: paste ? `${paste.title} · Sniptide` : "Paste not found · Sniptide" }
}

function expiresLabel(paste: Paste) {
  return paste.expiresAt ? formatDateTime(paste.expiresAt) : "Never"
}

export default async function Page({ params }: PageProps<"/pastes/[slug]">) {
  const { slug } = await params
  const paste = await getOwnPaste(slug)
  if (!paste) notFound()

  const [starred, share, { origin, host }, preferences] = await Promise.all([
    isStarred(slug),
    getShare(slug),
    getSiteOrigin(),
    getPreferences(),
  ])
  if (share && !share.seen) await markShareSeen(slug)

  const owned = !paste.owner
  const canEdit = owned || share?.access === "edit"
  const url = `${origin}/${paste.slug}`
  const files = await highlightFiles(paste.files)
  const first = files[0]
  const totalBytes = paste.files.reduce((size, file) => size + byteLength(file.content), 0)
  const lines = paste.files.reduce((count, file) => count + lineCount(file.content), 0)
  const collection = collections.find((c) => c.slug === paste.collection)
  const parent = owned
    ? { label: "My pastes", href: "/pastes" }
    : { label: "Shared with me", href: "/shared" }
  const revision = paste.revisions.length
  const sharingState = {
    slug,
    url,
    visibility: paste.visibility,
    expiresLabel: expiresLabel(paste),
    hasPassword: Boolean(paste.password),
    burnAfterRead: paste.burnAfterRead,
    allowRaw: paste.allowRaw,
  }

  return (
    <div className="flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:gap-6 lg:p-7 lg:pb-7">
      <SetBreadcrumb trail={[parent, { label: paste.title }]} />

      {/* Mobile header */}
      <div className="sticky top-0 z-20 flex h-[52px] items-center justify-between bg-background px-2 pt-[env(safe-area-inset-top)] box-content lg:hidden">
        <Link href={parent.href} className="flex items-center gap-1 px-2 text-[15px]">
          <ChevronLeftIcon className="size-5" />
          {parent.label}
        </Link>
        <div className="flex items-center">
          <StarButton slug={slug} starred={starred} variant="ghost" />
          <PasteOverflowMenu
            slug={slug}
            canTrash={owned}
            rawHref={
              paste.allowRaw && first
                ? `/${slug}/raw?file=${encodeURIComponent(first.name)}`
                : undefined
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:px-0">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10">
              {paste.title}
            </h1>
            <VisibilityBadge paste={paste} />
          </div>
          {paste.description ? (
            <p className="text-sm text-muted-foreground">{paste.description}</p>
          ) : null}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
            <a
              href={`/${paste.slug}`}
              className="hidden font-mono text-link hover:underline lg:inline"
            >
              {host}/{paste.slug}
            </a>
            <span aria-hidden="true" className="hidden lg:inline">
              /
            </span>
            {first ? (
              <LanguageLabel language={first.language} className="text-foreground/80" />
            ) : null}
            <span>· {formatNumber(lines)} lines</span>
            <span className="hidden lg:inline">· {formatBytes(totalBytes)}</span>
            {collection ? <span className="hidden lg:inline">· in {collection.name}</span> : null}
            <span>· edited {timeAgo(paste.updatedAt)}</span>
            {paste.owner ? (
              <span>
                · by {paste.owner.name}
                {share ? ` (can ${share.access})` : ""}
              </span>
            ) : null}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <StarButton slug={slug} starred={starred} />
          {canEdit ? (
            <Button
              variant="outline"
              size="lg"
              render={<Link href={`/pastes/${slug}/edit`} />}
              nativeButton={false}
            >
              <PencilIcon />
              Edit
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="lg"
            render={<Link href={`/new?from=${slug}`} />}
            nativeButton={false}
          >
            <CopyIcon />
            Duplicate
          </Button>
          <CopyLinkButton url={url} />
        </div>
      </div>

      <ShareLinkField url={url} className="mx-4 mt-4 h-11 lg:hidden" />

      <div className="flex flex-col gap-5 pt-4 lg:flex-row lg:items-start lg:pt-0">
        <FileViewer
          slug={slug}
          files={files}
          rawAllowed={paste.allowRaw}
          lineNumbers={preferences.lineNumbers}
          className="mx-4 hidden min-h-[612px] flex-1 lg:mx-0 lg:flex"
          footer={
            <>
              <span>UTF-8 · LF · {indentLabel(preferences.indentation)}</span>
              <span>
                Revision {revision} of {revision}
              </span>
            </>
          }
        />
        <FileViewer
          slug={slug}
          files={files}
          rawAllowed={paste.allowRaw}
          lineNumbers={preferences.lineNumbers}
          collapseAt={6}
          className="mx-4 lg:hidden"
          bodyClassName="bg-sidebar"
        />

        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
          <div className="hidden lg:block">
            {owned ? (
              <SharingPanel state={sharingState} />
            ) : (
              <section className="flex flex-col gap-2 border border-border p-4 text-[13px]">
                <h2 className="text-sm font-semibold">Shared with you</h2>
                <p className="text-muted-foreground">
                  {paste.owner?.name} gave you {share?.access === "edit" ? "edit" : "view"} access.
                </p>
              </section>
            )}
          </div>

          <section
            aria-labelledby="views-heading"
            className="hidden flex-col gap-3 border border-border p-4 lg:flex"
          >
            <div className="flex items-center justify-between">
              <h2 id="views-heading" className="text-sm font-semibold">
                Views
              </h2>
              <span className="text-xs text-muted-foreground">last 14 days</span>
            </div>
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-bold tracking-[-0.02em] tabular-nums">
                {formatNumber(paste.views)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatNumber(paste.uniqueViews)} unique
              </span>
            </p>
            <ViewsSparkline values={paste.viewsByDay.slice(-14)} />
          </section>

          <section
            aria-labelledby="revisions-heading"
            className="hidden flex-col gap-3 border border-border p-4 lg:flex"
          >
            <h2 id="revisions-heading" className="text-sm font-semibold">
              Revisions
            </h2>
            <ol className="flex flex-col gap-3 text-[13px]">
              {paste.revisions.map((entry, index) => (
                <li
                  key={`${entry.createdAt}-${entry.message}`}
                  className="flex items-center gap-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={
                      index === 0
                        ? "size-2 shrink-0 bg-primary"
                        : "size-2 shrink-0 border-[1.5px] border-foreground"
                    }
                  />
                  <span className={index === 0 ? "font-medium" : undefined}>{entry.message}</span>
                  <span className="ml-auto text-muted-foreground">{timeAgo(entry.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Mobile settings list */}
          <div className="mx-4 lg:hidden">
            {owned ? (
              <SharingPanel variant="list" state={sharingState}>
                <SettingRow label="Views" list>
                  <span className="text-muted-foreground">
                    {formatNumber(paste.views)} · {formatNumber(paste.uniqueViews)} unique
                  </span>
                </SettingRow>
              </SharingPanel>
            ) : (
              <dl className="divide-y divide-border border border-border text-[15px]">
                <MobileRow label="Expires" value={expiresLabel(paste)} />
                <MobileRow
                  label="Views"
                  value={`${formatNumber(paste.views)} · ${formatNumber(paste.uniqueViews)} unique`}
                />
                <MobileRow label="Revisions" value={String(revision)} />
              </dl>
            )}
          </div>
        </div>
      </div>

      {/* Mobile bottom actions */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        {canEdit ? (
          <Button
            variant="outline"
            className="h-12 flex-1 text-base"
            render={<Link href={`/pastes/${slug}/edit`} />}
            nativeButton={false}
          >
            <PencilIcon />
            Edit
          </Button>
        ) : null}
        <ShareButton
          url={url}
          title={paste.title}
          className="h-12 flex-[2] text-base font-semibold"
        />
      </div>
    </div>
  )
}

function MobileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-12 items-center justify-between px-4">
      <dt>{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  )
}
