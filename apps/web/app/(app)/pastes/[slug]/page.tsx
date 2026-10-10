import { Button } from "@sniptide/ui/components/button"
import { ChevronLeftIcon, ClockIcon, CopyIcon, PencilIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CollectionIcon } from "@/components/collections/icon"
import { FileViewer } from "@/components/paste/file-viewer"
import {
  CopyLinkButton,
  PasteOverflowMenu,
  ShareButton,
  StarButton,
} from "@/components/paste/paste-actions"
import {
  PasteDetailPanel,
  SettingRow,
  ShareLinkField,
  SharingPanel,
} from "@/components/paste/sharing-panel"
import { SidePanelProvider } from "@/components/paste/side-panel"
import { ViewsSparkline } from "@/components/paste/views-chart"
import { VisibilityBadge } from "@/components/paste/visibility-badge"
import { HeaderActions, HeaderTitle } from "@/components/shell/page-header"
import { getPreferences } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format"
import { highlightFiles } from "@/lib/highlight/highlight"
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

  const [starred, share, { origin, host }, preferences, collections] = await Promise.all([
    isStarred(slug),
    getShare(slug),
    getSiteOrigin(),
    getPreferences(),
    listCollections(),
  ])
  if (share && !share.seen) await markShareSeen(slug)

  const owned = !paste.owner
  const canEdit = owned || share?.access === "edit"
  const url = `${origin}/${paste.slug}`
  const files = await highlightFiles(paste.files)
  const first = files[0]
  const collection = owned ? collections.find((c) => c.slug === paste.collection) : undefined
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
      <HeaderTitle>
        <span className="truncate">{paste.title}</span>
        <VisibilityBadge paste={paste} />
      </HeaderTitle>
      <HeaderActions>
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
      </HeaderActions>

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

      <div className="flex min-w-0 flex-col gap-2 px-4 lg:px-0">
        <div className="flex flex-wrap items-center gap-3 lg:hidden">
          <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em]">
            {paste.title}
          </h1>
          <VisibilityBadge paste={paste} />
        </div>
        {paste.description ? (
          <p className="text-sm text-muted-foreground">{paste.description}</p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <a
            href={`/${paste.slug}`}
            className="hidden font-mono text-link hover:underline lg:inline"
          >
            {host}/{paste.slug}
          </a>
          {collection ? (
            <>
              <MetaDivider />
              <Link
                href={`/collections/${collection.slug}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <CollectionIcon icon={collection.icon} hue={collection.hue} className="size-3" />
                {collection.name}
              </Link>
            </>
          ) : null}
          <MetaDivider />
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <ClockIcon className="size-3.5" />
            Edited {timeAgo(paste.updatedAt)}
          </span>
          {paste.owner ? (
            <>
              <MetaDivider />
              <span>
                by {paste.owner.name}
                {share ? ` (can ${share.access})` : ""}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <ShareLinkField url={url} className="mx-4 mt-4 h-11 lg:hidden" />

      <SidePanelProvider>
        <div className="flex flex-col gap-5 pt-4 lg:flex-row lg:items-start lg:pt-0">
          <FileViewer
            slug={slug}
            files={files}
            rawAllowed={paste.allowRaw}
            lineNumbers={preferences.lineNumbers}
            collapseAt={6}
            panelToggle
            className="mx-4 lg:mx-0 lg:min-h-[612px] lg:flex-1"
            bodyClassName="max-lg:bg-sidebar"
            footerClassName="hidden lg:flex"
            footer={
              <>
                <span>UTF-8 · LF · {indentLabel(preferences.indentation)}</span>
                <span>
                  Revision {revision} of {revision}
                </span>
              </>
            }
          />

          <PasteDetailPanel
            state={owned ? sharingState : undefined}
            sharedNote={
              <p className="text-muted-foreground">
                {paste.owner?.name} gave you {share?.access === "edit" ? "edit" : "view"} access.
              </p>
            }
            views={
              <>
                <p className="flex items-baseline gap-1.5">
                  <span className="font-heading text-3xl font-bold tracking-[-0.02em] tabular-nums">
                    {formatNumber(paste.views)}
                  </span>
                  <span className="text-xs text-muted-foreground">views</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatNumber(paste.uniqueViews)} unique
                  </span>
                </p>
                <ViewsSparkline values={paste.viewsByDay.slice(-14)} />
                <p className="flex justify-between text-xs text-muted-foreground">
                  <span>14 days ago</span>
                  <span>Today</span>
                </p>
              </>
            }
            revisions={
              <ol className="flex flex-col divide-y divide-border">
                {paste.revisions.map((entry, index) => (
                  <li
                    key={`${entry.createdAt}-${entry.message}`}
                    className="flex items-start gap-2.5 py-2.5 first:pt-1 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        index === 0
                          ? "mt-1.5 size-2 shrink-0 bg-link"
                          : "mt-1.5 size-2 shrink-0 border-[1.5px] border-muted-foreground"
                      }
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2">
                        <span className={index === 0 ? "font-medium" : undefined}>
                          {entry.message}
                        </span>
                        {index === 0 ? (
                          <span className="border border-border px-1 text-[11px] text-muted-foreground">
                            Current
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(entry.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            }
          />
        </div>
      </SidePanelProvider>

      <div className="flex w-full flex-col gap-4 pt-4 lg:hidden">
        {/* Mobile settings list */}
        <div className="mx-4">
          {owned ? (
            <SharingPanel state={sharingState}>
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

function MetaDivider() {
  return <span aria-hidden="true" className="hidden h-3.5 w-px bg-border lg:block" />
}
