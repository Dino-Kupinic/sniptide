import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import { ChevronLeftIcon, ClockIcon, CopyIcon, PencilIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CollectionIcon } from "@/components/collections/icon"
import {
  GroupedCanvas,
  groupedPanelClass,
  groupedSettingRowClass,
} from "@/components/lists/grouped-list"
import { LocalDateTime } from "@/components/local-date-time"
import { CompareRevisions } from "@/components/paste/compare-revisions"
import {
  DecryptedDescription,
  DecryptedFileViewer,
  EncryptedPasteProvider,
} from "@/components/paste/encrypted-paste"
import { ExpiredBadge, ExpiredNotice } from "@/components/paste/expiry-status"
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
import { PasteDetailPanel, SharingPanel, SheetRow } from "@/components/paste/sharing-panel"
import { SidePanelProvider } from "@/components/paste/side-panel"
import { ViewsSparkline } from "@/components/paste/views-chart"
import { VisibilityBadge } from "@/components/paste/visibility-badge"
import { UserAvatar } from "@/components/people/user-avatar"
import { HeaderActions, HeaderTitle } from "@/components/shell/page-header"
import { TruncatedText } from "@/components/truncated-text"
import { getPreferences, getSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { formatNumber, lineCount, timeAgo } from "@/lib/format"
import { highlightFiles } from "@/lib/highlight/highlight"
import { exportTarget } from "@/lib/integrations/exports"
import { listIntegrations } from "@/lib/integrations/store"
import { embedCode } from "@/lib/pastes/embed"
import { slugFromRoute } from "@/lib/pastes/links"
import { getShare, listPasteShares, markShareSeen } from "@/lib/pastes/shares"
import { getPaste, getPasteMeta, isStarred } from "@/lib/pastes/store"
import type { Paste } from "@/lib/pastes/types"
import { WEBHOOK_TARGETS } from "@/lib/pastes/webhook-url"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/pastes/[slug]">) {
  const paste = await getPasteMeta(slugFromRoute((await params).slug))
  const t = await getTranslations("Core")
  return { title: paste ? `${paste.title} · Sniptide` : `${t("pasteNotFound")} · Sniptide` }
}

export default async function Page({ params, searchParams }: PageProps<"/pastes/[slug]">) {
  const [{ slug: segment }, query] = await Promise.all([params, searchParams])
  const slug = slugFromRoute(segment)
  const revisionParam = Number(query.revisions)
  const revisionPage =
    Number.isSafeInteger(revisionParam) && revisionParam > 0 ? Math.min(revisionParam, 1000000) : 1
  const [paste, t, locale] = await Promise.all([
    getPaste(slug, revisionPage),
    getTranslations("Core"),
    getLocale(),
  ])
  if (!paste) notFound()
  const expiresLabel = (paste: Paste) =>
    paste.expiresAt === null ? t("never") : <LocalDateTime value={paste.expiresAt} />

  const owned = !paste.owner
  const [starred, share, { origin, host }, preferences, collections, people, session, files] =
    await Promise.all([
      isStarred(slug),
      owned ? null : getShare(slug),
      getSiteOrigin(),
      getPreferences(),
      listCollections(),
      owned ? listPasteShares(slug) : null,
      getSession(),
      // An encrypted paste's one file is ciphertext; the browser decrypts and colours it.
      paste.encryptionKeyId ? [] : highlightFiles(paste.files),
    ])
  if (share && !share.seen) await markShareSeen(slug)
  // Services the owner can send this paste to, such as Slack, when the server has their app.
  const shareProviders =
    owned && session && !paste.encryptionKeyId
      ? (await listIntegrations(session.user.id)).flatMap(({ id, name, available, connection }) => {
          const target = available ? exportTarget(id) : null
          return target ? [{ id, name, kind: target.kind, connected: connection !== null }] : []
        })
      : []

  const { encryptionKeyId } = paste
  const envelope = encryptionKeyId ? paste.files[0]?.content : undefined
  // Content is fixed once encrypted, so there is nothing to edit, duplicate or compare.
  const canEdit = !encryptionKeyId && (owned || share?.access === "edit")
  const url = `${origin}/${paste.slug}`
  const first = files[0]
  const collection = owned ? collections.find((c) => c.slug === paste.collection) : undefined
  const parent = owned
    ? { label: t("pastes"), href: "/pastes" }
    : { label: t("shared"), href: "/shared" }
  const revision = paste.revisionCount
  const viewer = session?.user
  // A link that works for anyone who has it, which is what a channel post or an embed needs.
  const linkShareable =
    paste.visibility !== "private" &&
    !paste.password &&
    !paste.burnAfterRead &&
    !encryptionKeyId &&
    (!paste.expiresAt || paste.expiresAt > Date.now())
  const shareDialog = (trigger: "button" | "icon") =>
    people ? (
      <ShareDialog
        slug={slug}
        expiresAt={paste.expiresAt}
        title={paste.title}
        url={url}
        encryptionKeyId={encryptionKeyId}
        visibility={paste.visibility}
        owner={{
          id: paste.author.id,
          name: paste.author.name,
          handle: viewer?.username
            ? `@${viewer.displayUsername ?? viewer.username}`
            : (viewer?.email ?? ""),
          image: paste.author.image,
        }}
        people={people}
        trigger={trigger}
        webhookTargets={WEBHOOK_TARGETS.filter((target) => Boolean(getConfig().webhooks[target]))}
        webhookAllowed={linkShareable}
        shareProviders={shareProviders}
        // Mirrors exportReveal in lib/integrations/exports.ts, which checks again on send.
        shareReveal={
          paste.visibility !== "private" && !paste.password && !paste.burnAfterRead
            ? "details"
            : "link"
        }
        embedCode={
          linkShareable && first
            ? embedCode(url, paste.title, lineCount(first.content), files.length)
            : undefined
        }
      />
    ) : null
  const sharingState = {
    slug,
    url,
    visibility: paste.visibility,
    expiresAt: paste.expiresAt,
    hasPassword: Boolean(paste.password),
    burnAfterRead: paste.burnAfterRead,
    allowRaw: paste.allowRaw,
    encryptionKeyId,
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
      {owned && paste.agentReads > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("agentReads", { count: paste.agentReads })}
        </p>
      ) : null}
    </>
  )
  const revisions = (
    <div>
      {encryptionKeyId ? null : (
        <CompareRevisions
          slug={slug}
          current={{ title: paste.title, description: paste.description, files: paste.files }}
        />
      )}
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
              {!entry.restorable ? (
                <span className="text-xs text-muted-foreground">{t("snapshotUnavailable")}</span>
              ) : null}
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

  const page = (
    <ActiveFileProvider>
      <div className="flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:gap-5 lg:p-7 lg:pb-7">
        {/* The page's own heading carries the visibility badge, so the bar keeps only the title. */}
        <HeaderTitle>
          <TruncatedText className="max-w-80">{paste.title}</TruncatedText>
        </HeaderTitle>
        <HeaderActions>
          <StarButton slug={slug} starred={starred} />
          {encryptionKeyId ? null : (
            <Button
              variant="outline"
              size="lg"
              render={<Link href={`/new?from=${slug}`} />}
              nativeButton={false}
            >
              <CopyIcon />
              {t("duplicate")}
            </Button>
          )}
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
          <CopyLinkButton url={url} encryptionKeyId={encryptionKeyId} expiresAt={paste.expiresAt} />
        </HeaderActions>

        {/* Mobile header */}
        <GroupedCanvas />
        <div className="sticky top-0 z-20 box-content flex h-[52px] items-center justify-between gap-1 bar-translucent pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] lg:hidden">
          <Link
            href={parent.href}
            className="flex h-10 min-w-0 items-center gap-0.5 rounded-lg pr-2 text-[17px] leading-[22px] text-link outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronLeftIcon aria-hidden className="size-6 shrink-0" strokeWidth={2} />
            <span className="truncate">{parent.label}</span>
          </Link>
          <div className="flex shrink-0 items-center">
            <StarButton slug={slug} starred={starred} variant="ghost" className="size-10" />
            <PasteOverflowMenu
              slug={slug}
              title={paste.title}
              expiresAt={paste.expiresAt}
              canTrash={owned}
              canLeave={Boolean(share)}
              canEdit={canEdit}
              rawAllowed={paste.allowRaw && !encryptionKeyId}
              url={url}
              encryptionKeyId={encryptionKeyId}
              className="text-link [&_svg]:size-[22px]"
            />
          </div>
        </div>

        {/* Title, description and code card sit where the editor puts them, so Edit doesn't jump. */}
        <div className="flex min-w-0 flex-col gap-1.5 px-4 lg:px-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 [overflow-wrap:anywhere] font-heading text-[26px] leading-8 font-bold tracking-[-0.02em] lg:text-2xl">
              {paste.title}
            </h1>
            <ExpiredBadge expiresAt={paste.expiresAt} />
            {/* The owner's Sharing row below already shows the visibility. */}
            {owned ? null : <VisibilityBadge paste={paste} />}
          </div>
          <ExpiredNotice expiresAt={paste.expiresAt} />
          {encryptionKeyId ? (
            <DecryptedDescription className="text-base leading-6 lg:text-sm lg:leading-5" />
          ) : paste.description ? (
            <p className="text-base leading-6 lg:text-sm lg:leading-5">{paste.description}</p>
          ) : null}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px] leading-5 text-muted-foreground lg:mt-1 lg:gap-x-3 lg:text-[13px] lg:leading-normal">
            <a
              href={`/${paste.slug}`}
              className="hidden font-mono text-link hover:underline lg:inline"
            >
              {host}/{paste.slug}
            </a>
            {/* The link above is desktop only, so on phones the line starts without a dot. */}
            {collection ? (
              <>
                <MetaDivider className="max-lg:hidden" />
                <Link
                  href={`/collections/${collection.slug}`}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <CollectionIcon icon={collection.icon} hue={collection.hue} className="size-3" />
                  {collection.name}
                </Link>
              </>
            ) : null}
            <MetaDivider className={collection ? undefined : "max-lg:hidden"} />
            <span className="flex items-center gap-1.5 lg:font-medium lg:text-foreground">
              <ClockIcon className="hidden size-3.5 lg:block" />
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
            {encryptionKeyId ? (
              <DecryptedFileViewer
                slug={slug}
                lineNumbers={preferences.lineNumbers}
                collapseAt={6}
                panelToggle
                phoneCard
                className="mx-4 lg:mx-0 lg:min-h-[548px] lg:flex-1"
                bodyClassName="bg-card lg:bg-muted lg:dark:bg-sidebar"
                footer={t("endToEndEncrypted")}
              />
            ) : (
              <FileViewer
                slug={slug}
                files={files}
                rawAllowed={paste.allowRaw}
                lineNumbers={preferences.lineNumbers}
                collapseAt={6}
                panelToggle
                printable
                phoneCard
                className="mx-4 lg:mx-0 lg:min-h-[548px] lg:flex-1"
                bodyClassName="bg-card lg:bg-muted lg:dark:bg-sidebar"
                footer={t("revision", { number: revision, total: revision })}
              />
            )}

            <PasteDetailPanel
              state={owned ? sharingState : undefined}
              sharedNote={sharedNote}
              views={views}
              revisions={revisions}
            />
          </div>
        </SidePanelProvider>

        {/* Mobile settings list */}
        <div className="mx-4 pt-7 lg:hidden">
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
            <div className={cn(groupedPanelClass, "pl-4")}>
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
        <div className="fixed inset-x-0 bottom-0 z-20 box-content flex h-16 items-center gap-2.5 border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden">
          {shareDialog("icon") ?? (
            <ShareButton
              url={url}
              encryptionKeyId={encryptionKeyId}
              title={paste.title}
              expiresAt={paste.expiresAt}
              variant="outline"
              className="size-10 shrink-0"
            />
          )}
          <CopyCodeButton slug={slug} className="flex-1" />
        </div>
      </div>
    </ActiveFileProvider>
  )
  return encryptionKeyId && envelope ? (
    <EncryptedPasteProvider envelope={envelope} keyId={encryptionKeyId}>
      {page}
    </EncryptedPasteProvider>
  ) : (
    page
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
        <UserAvatar person={owner} className="size-7" />
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

function MobileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={cn(groupedSettingRowClass, "justify-between")}>
      <dt>{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  )
}

// A dot between the facts on phones, where they wrap as one line of text, and a hairline on desktop.
function MetaDivider({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("lg:h-3.5 lg:w-px lg:bg-border", className)}>
      <span className="lg:hidden">·</span>
    </span>
  )
}
