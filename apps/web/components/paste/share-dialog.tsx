"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@sniptide/ui/components/dialog"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { EyeIcon, GlobeIcon, LinkIcon, LockIcon, ShareIcon, UsersIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { showUndo } from "@/components/undo-toast"
import { track } from "@/lib/analytics"
import {
  invitePerson,
  removeShare,
  restoreRemovedShare,
  type ShareResult,
  setShareAccess,
} from "@/lib/pastes/actions"
import type { SharePerson, Visibility } from "@/lib/pastes/types"
import type { WebhookTarget } from "@/lib/pastes/webhook-url"
import { LinkCopyContent, useCopyLink } from "./copy-button"
import { EmbedShare } from "./embed-share"
import { useNativeShare } from "./paste-actions"
import { AccessMenu, InviteField, ShareAvatar } from "./share-people"
import { WebhookShare } from "./webhook-share"

const visibilityNote: Record<Visibility, { icon: typeof LockIcon; text: string }> = {
  private: { icon: LockIcon, text: "privateEveryoneElseGetsA404" },
  unlisted: { icon: EyeIcon, text: "unlistedAnyoneWithTheLinkCan" },
  public: { icon: GlobeIcon, text: "publicAnyoneCanFindAndOpen" },
}

// The owner's Share dialog from the Paper "Sharing" page: invite people with a Sniptide account
// by exact email or username, change what they can do, or take their access away. On phones it
// sits at the bottom of the screen like a sheet and is the page's one Share entry, so it also
// holds the link with Copy and the system share sheet.
export function ShareDialog({
  slug,
  title,
  url,
  visibility,
  owner,
  people: initialPeople,
  trigger,
  webhookTargets = [],
  webhookAllowed = false,
  embedCode,
}: {
  slug: string
  title: string
  url: string
  visibility: Visibility
  owner: { id: string; name: string; handle: string; initials: string }
  people: SharePerson[]
  trigger: "button" | "icon"
  webhookTargets?: WebhookTarget[]
  webhookAllowed?: boolean
  // The iframe code for /<slug>/embed; without it the section says why the paste can't embed.
  embedCode?: string
}) {
  const t = useTranslations("Paste")
  const feedbackT = useTranslations("Core")
  const [people, setPeople] = React.useState(initialPeople)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => setPeople(initialPeople), [initialPeople])

  function apply(result: ShareResult) {
    if (result.ok) {
      setPeople(result.people)
      setError(null)
    } else {
      setError(result.error)
    }
    return result.ok
  }

  // Applies a share action's result and says how it went; a throw shows in the dialog like any error.
  async function run(action: () => Promise<ShareResult>, success?: string) {
    try {
      const ok = apply(await action())
      if (ok && success) toast.success(success)
      return ok
    } catch {
      setError(t("somethingWentWrongTryAgain"))
      return false
    }
  }

  function invite(identifier: string, access: SharePerson["access"]) {
    return new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const ok = await run(() => invitePerson(slug, identifier, access), t("invitationSent"))
        if (ok) track("paste_shared", { access })
        resolve(ok)
      }),
    )
  }

  function change(person: SharePerson, access: SharePerson["access"]) {
    if (access === person.access) return
    startTransition(async () => {
      await run(() => setShareAccess(slug, person.id, access), t("accessUpdated"))
    })
  }

  function remove(person: SharePerson) {
    startTransition(async () => {
      const ok = await run(() => removeShare(slug, person.id))
      if (ok) {
        showUndo({
          labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
          message: t("removedPerson", { name: person.name }),
          undo: async () => {
            const result = await restoreRemovedShare(
              slug,
              person.id,
              person.access,
              person.sharedAt,
            )
            if (result.ok) apply(result)
            return result
          },
        })
      }
    })
  }

  const note = visibilityNote[visibility]

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : setError(null))}>
      {trigger === "button" ? (
        <DialogTrigger render={<Button variant="outline" size="lg" />}>
          <UsersIcon />
          {t("share")}
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={
            <Button variant="ghost" size="icon-lg" aria-label={t("share")} className="size-10" />
          }
        >
          <ShareIcon className="size-5" />
        </DialogTrigger>
      )}
      <DialogContent
        className={cn(
          "max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 lg:max-w-[540px]",
          // A bottom sheet on phones.
          "max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:w-full max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:border-x-0 max-lg:border-b-0 max-lg:shadow-none max-lg:pb-[env(safe-area-inset-bottom)] max-lg:max-h-[90dvh] max-lg:overflow-y-auto",
        )}
      >
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="truncate text-xl normal-case">{t("share")}</DialogTitle>
              <DialogDescription>{t("invitePeopleWithASniptideAccount")}</DialogDescription>
            </div>
            <DialogClose
              aria-label={t("close")}
              className="rounded-lg -mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 lg:size-8"
            >
              <XIcon className="size-5 lg:size-4" />
            </DialogClose>
          </div>
          <ShareLinkRow url={url} title={title} />
          <InviteField
            onInvite={invite}
            submitLabel={t("invite")}
            error={error}
            pending={pending}
          />
        </div>

        <div className="flex items-center justify-between border-y border-border bg-sidebar px-4 py-2.5 text-[13px] lg:px-6">
          <span className="font-medium">{t("peopleWithAccess")}</span>
        </div>

        <ul className="flex max-h-[40svh] flex-col divide-y divide-border overflow-y-auto">
          <li className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
            <ShareAvatar person={owner} className="size-8 text-[10px]" />
            <PersonName name={t("ownerYou", { name: owner.name })} handle={owner.handle} />
            <span className="text-[13px] text-muted-foreground">{t("owner")}</span>
          </li>
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
              <ShareAvatar person={person} className="size-8 text-[10px]" />
              <PersonName name={person.name} handle={person.handle} />
              <AccessMenu
                value={person.access}
                onChange={(access) => change(person, access)}
                onRemove={() => remove(person)}
                disabled={pending}
                label={t("accessFor", { name: person.name })}
              />
            </li>
          ))}
        </ul>

        <WebhookShare slug={slug} targets={webhookTargets} allowed={webhookAllowed} />
        <EmbedShare code={embedCode} />
        <div className="flex items-center justify-between gap-3 border-t border-border bg-sidebar px-4 py-3 max-lg:flex-col max-lg:items-stretch lg:px-6">
          <span className="flex items-center gap-2 text-[13px]">
            <note.icon className="size-3.5 shrink-0" />
            {t(note.text)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PersonName({ name, handle }: { name: string; handle: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-medium">{name}</span>
      <span className="truncate text-xs text-muted-foreground">{handle}</span>
    </span>
  )
}

// Keep the link visible; offer native sharing on phones where the browser supports it.
function ShareLinkRow({ url, title }: { url: string; title: string }) {
  const t = useTranslations("Paste")
  const { state, props } = useCopyLink(url, () =>
    track("share_link_copied", { from: "share_dialog" }),
  )
  const { share } = useNativeShare(url, title, "share_dialog")
  const [canShare, setCanShare] = React.useState(false)
  React.useEffect(() => setCanShare(typeof navigator.share === "function"), [])
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg flex h-10 items-center gap-2 border border-border bg-sidebar pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
        <Button type="button" variant="inverted" size="sm" {...props}>
          <LinkCopyContent state={state} label={t("copy")} icon={<LinkIcon />} />
        </Button>
      </div>
      {canShare ? (
        <Button type="button" variant="outline" size="xl" className="lg:hidden" onClick={share}>
          <ShareIcon />
          {t("shareVia")}
        </Button>
      ) : null}
    </div>
  )
}
