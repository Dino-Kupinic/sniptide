import { Button } from "@sniptide/ui/components/button"
import { ChevronLeftIcon, ClockIcon, CopyIcon, PencilIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CollectionIcon } from "@/components/collections/icon"
import { ActiveFileProvider, FileViewer } from "@/components/paste/file-viewer"
import {
  CopyCodeButton,
  CopyLinkButton,
  LeaveShareButton,
  PasteOverflowMenu,
  ShareButton,
  StarButton,
} from "@/components/paste/paste-actions"
import { RestoreRevision } from "@/components/paste/restore-revision"
import { ShareDialog } from "@/components/paste/share-dialog"
import { ShareAvatar } from "@/components/paste/share-people"
import { PasteDetailPanel, SharingPanel, SheetRow } from "@/components/paste/sharing-panel"
import { SidePanelProvider } from "@/components/paste/side-panel"
import { ViewsSparkline } from "@/components/paste/views-chart"
import { VisibilityBadge } from "@/components/paste/visibility-badge"
import { HeaderActions, HeaderTitle } from "@/components/shell/page-header"
import { getPreferences, getSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format"
import { highlightFiles } from "@/lib/highlight/highlight"
import {
  getPaste,
  getPasteMeta,
  getShare,
  isStarred,
  listPasteShares,
  markShareSeen,
} from "@/lib/pastes/store"
import type { Paste } from "@/lib/pastes/types"
import { WEBHOOK_TARGETS } from "@/lib/pastes/webhook-url"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/pastes/[slug]">) {
  const paste = await getPasteMeta((await params).slug)
  const t = await getTranslations("Core")
  return { title: paste ? `${paste.title} · Sniptide` : `${t("pasteNotFound")} · Sniptide` }
}

export default async function Page({ params, searchParams }: PageProps<"/pastes/[slug]">) {
  const { slug } = await params
  const [t, locale] = await Promise.all([getTranslations("Core"), getLocale()])
  const expiresLabel = (paste: Paste) =>
    paste.expiresAt ? formatDateTime(paste.expiresAt, locale) : t("never")
  const revisionParam = Number((await searchParams).revisions)
  const revisionPage =
    Number.isSafeInteger(revisionParam) && revisionParam > 0 ? Math.min(revisionParam, 1000000) : 1
  const paste = await getPaste(slug, revisionPage)
  if (!paste) notFound()

  const owned = !paste.owner
  const [starred, share, { origin, host }, preferences, collections, people, session] =
    await Promise.all([
      isStarred(slug),
      owned ? null : getShare(slug),
      getSiteOrigin(),
      getPreferences(),
      listCollections(),
      owned ? listPasteShares(slug) : null,
      getSession(),
    ])
  if (share && !share.seen) await markShareSeen(slug)

  const canEdit = owned || share?.access === "edit"
  const url = `${origin}/${paste.slug}`
  const files = await highlightFiles(paste.files)
  const collection = owned ? collections.find((c) => c.slug === paste.collection) : undefined
  const parent = owned
    ? { label: t("pastes"), href: "/pastes" }
    : { label: t("shared"), href: "/shared" }
  const revision = paste.revisionCount
  const viewer = session?.user
  const shareDialog = (trigger: "button" | "icon") =>
    people ? (
      <ShareDialog
        slug={slug}
        title={paste.title}
        url={url}
        visibility={paste.visibility}
        owner={{
          id: paste.author.username,
          name: paste.author.name,
          handle: viewer?.username
            ? `@${viewer.displayUsername ?? viewer.username}`
            : (viewer?.email ?? ""),
          initials: paste.author.initials,
        }}
        people={people}
        trigger={trigger}
        webhookTargets={WEBHOOK_TARGETS.filter((target) => Boolean(getConfig().webhooks[target]))}
        webhookAllowed={
          paste.visibility !== "private" &&
          !paste.password &&
          !paste.burnAfterRead &&
          (!paste.expiresAt || paste.expiresAt > Date.now())
        }
      />
    ) : null
  const sharingState = {
    slug,
    url,
    visibility: paste.visibility,
    expiresLabel: expiresLabel(paste),
    neverExpires: !paste.expiresAt,
    hasPassword: Boolean(paste.password),
    burnAfterRead: paste.burnAfterRead,
    allowRaw: paste.allowRaw,
  }

  // Rendered once and shown in the desktop side panel and in the mobile sheets.
  const views = (
    <>
      <p className="flex items-baseline gap-1.5">
        <span className="font-heading text-3xl font-bold tracking-[-0.02em] tabular-nums">
          {formatNumber(paste.views, locale)}
        </span>
        <span className="text-xs text-muted-foreground">{t("views")}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t("unique", { count: paste.uniqueViews })}
        </span>
      </p>
      <ViewsSparkline values={paste.viewsByDay.slice(-14)} />
      <p className="flex justify-between text-xs text-muted-foreground">
        <span>{t("fourteenDays")}</span>
        <span>{t("today")}</span>
      </p>
    </>
  )
  const revisions = (
    <div>
      <ol className="flex flex-col divide-y divide-border">
        {paste.revisions.map((entry, index) => {
          // Counted from the oldest, the way "Restored revision 3" names them.
          const number = paste.revisionCount - (paste.revisionPage - 1) * 20 - index
          const current = index === 0 && paste.revisionPage === 1
          return (
            <li key={entry.id} className="flex items-start gap-2.5 py-2.5 first:pt-1 last:pb-0">
              <span
                aria-hidden="true"
                className={
                  current
                    ? "mt-1.5 size-2 shrink-0 bg-link"
                    : "mt-1.5 size-2 shrink-0 border-[1.5px] border-muted-foreground"
                }
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className={current ? "font-medium" : undefined}>{entry.message}</span>
                  {current ? (
                    <span className="rounded-sm border border-border px-1 text-[11px] text-muted-foreground">
                      {t("current")}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  #{number} · {timeAgo(entry.createdAt, Date.now(), locale)}
                </span>
              </span>
              {canEdit && !current && entry.restorable ? (
                <RestoreRevision slug={slug} revisionId={entry.id} number={number} />
              ) : null}
            </li>
          )
        })}
      </ol>
      {paste.revisionPageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          {paste.revisionPage > 1 ? (
            <Link
              className="text-link"
              href={`?revisions=${paste.revisionPage - 1}`}
              scroll={false}
            >
              {t("newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {paste.revisionPage} / {paste.revisionPageCount}
          </span>
          {paste.revisionPage < paste.revisionPageCount ? (
            <Link
              className="text-link"
              href={`?revisions=${paste.revisionPage + 1}`}
              scroll={false}
            >
              {t("older")}
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  )
  const sharedNote =
    paste.owner && share ? (
      <SharedWithYou slug={slug} title={paste.title} owner={paste.owner} share={share} />
    ) : undefined
  const viewsValue = `${formatNumber(paste.views, locale)} · ${t("unique", { count: paste.uniqueViews })}`

  return (
    <ActiveFileProvider>
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
              {t("edit")}
            </Button>
          ) : null}
          {shareDialog("button")}
          <Button
            variant="outline"
            size="lg"
            render={<Link href={`/new?from=${slug}`} />}
            nativeButton={false}
          >
            <CopyIcon />
            {t("duplicate")}
          </Button>
          <CopyLinkButton url={url} />
        </HeaderActions>

        {/* Mobile header */}
        <div className="sticky top-0 z-20 box-content flex h-[52px] items-center justify-between gap-1 bg-background pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] lg:hidden">
          <Button
            variant="ghost"
            size="xl"
            render={<Link href={parent.href} />}
            nativeButton={false}
            className="min-w-0 gap-1 px-2"
          >
            <ChevronLeftIcon />
            <span className="truncate">{parent.label}</span>
          </Button>
          <div className="flex shrink-0 items-center">
            {shareDialog("icon") ?? (
              <ShareButton url={url} title={paste.title} className="size-10" />
            )}
            <StarButton slug={slug} starred={starred} variant="ghost" className="size-10" />
            <PasteOverflowMenu
              slug={slug}
              title={paste.title}
              canTrash={owned}
              canLeave={Boolean(share)}
              rawAllowed={paste.allowRaw}
              url={url}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 px-4 lg:px-0">
          <div className="flex flex-wrap items-center gap-3 lg:hidden">
            <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em]">
              {paste.title}
            </h1>
            {/* The owner's Sharing row below already shows the visibility. */}
            {owned ? null : <VisibilityBadge paste={paste} />}
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
              {t("edited", { time: timeAgo(paste.updatedAt, Date.now(), locale) })}
            </span>
            {paste.owner ? (
              <>
                <MetaDivider />
                <span>
                  {share
                    ? t("byOwnerAccess", {
                        name: paste.owner.name,
                        access: t(share.access === "edit" ? "canEdit" : "canView"),
                      })
                    : t("byOwner", { name: paste.owner.name })}
                </span>
              </>
            ) : null}
          </p>
        </div>

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
                  <span>
                    UTF-8 · LF ·{" "}
                    {preferences.indentation === "tab"
                      ? t("indentTabs")
                      : t("indentSpaces", { count: Number(preferences.indentation) })}
                  </span>
                  <span>{t("revision", { number: revision, total: revision })}</span>
                </>
              }
            />

            <PasteDetailPanel
              state={owned ? sharingState : undefined}
              sharedNote={sharedNote}
              views={views}
              revisions={revisions}
            />
          </div>
        </SidePanelProvider>

        {/* Mobile settings list */}
        <div className="mx-4 pt-4 lg:hidden">
          {owned ? (
            <SharingPanel state={sharingState}>
              <SheetRow label={t("viewsLabel")} value={viewsValue}>
                {views}
              </SheetRow>
              <SheetRow label={t("revisions")} value={String(revision)}>
                {revisions}
              </SheetRow>
            </SharingPanel>
          ) : (
            <div className="overflow-hidden rounded-lg divide-y divide-border border border-border text-sm">
              {share && sharedNote ? (
                <SheetRow
                  label={t("yourAccess")}
                  value={t(share.access === "edit" ? "canEdit" : "canView")}
                >
                  {sharedNote}
                </SheetRow>
              ) : null}
              <dl>
                <MobileRow label={t("expiresLabel")} value={expiresLabel(paste)} />
              </dl>
              <SheetRow label={t("viewsLabel")} value={viewsValue}>
                {views}
              </SheetRow>
              <SheetRow label={t("revisions")} value={String(revision)}>
                {revisions}
              </SheetRow>
            </div>
          )}
        </div>

        {/* Mobile bottom actions */}
        <div className="fixed inset-x-0 bottom-0 z-20 box-content flex h-14 items-center gap-2 border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden">
          {canEdit ? (
            <Button
              variant="outline"
              size="xl"
              className="flex-1"
              render={<Link href={`/pastes/${slug}/edit`} />}
              nativeButton={false}
            >
              <PencilIcon />
              {t("edit")}
            </Button>
          ) : null}
          <CopyCodeButton slug={slug} className="flex-[2]" />
        </div>
      </div>
    </ActiveFileProvider>
  )
}

// The recipient's "Shared with you" panel: who shared it, what they can do, and a way out.
async function SharedWithYou({
  slug,
  title,
  owner,
  share,
}: {
  slug: string
  title: string
  owner: NonNullable<Paste["owner"]>
  share: NonNullable<Awaited<ReturnType<typeof getShare>>>
}) {
  const [t, locale] = await Promise.all([getTranslations("Core"), getLocale()])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <ShareAvatar
          person={{
            id: owner.username,
            name: owner.name,
            handle: owner.username,
            initials: owner.initials,
          }}
          className="size-7 text-[10px]"
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{owner.name}</span>
          <span className="text-xs text-muted-foreground">
            {t("sharedTime", { time: timeAgo(share.sharedAt, Date.now(), locale) })}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t("yourAccess")}</span>
        <span
          className={
            share.access === "edit"
              ? "rounded-md bg-foreground px-2 py-0.5 font-medium text-background"
              : "rounded-md border border-border px-2 py-0.5 font-medium"
          }
        >
          {t(share.access === "edit" ? "canEdit" : "canView")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(share.access === "edit" ? "editPermission" : "viewPermission", { name: owner.name })}
      </p>
      <LeaveShareButton slug={slug} title={title} className="h-8 text-[13px]" />
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
