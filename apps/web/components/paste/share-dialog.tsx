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
import { EyeIcon, GlobeIcon, LockIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react"
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
import { AccessMenu, InviteField, ShareAvatar } from "./share-people"
import { WebhookShare } from "./webhook-share"

const visibilityNote: Record<Visibility, { icon: typeof LockIcon; text: string }> = {
  private: { icon: LockIcon, text: "Private. Everyone else gets a 404." },
  unlisted: { icon: EyeIcon, text: "Unlisted. Anyone with the link can open it too." },
  public: { icon: GlobeIcon, text: "Public. Anyone can find and open it too." },
}

// The owner's Share dialog from the Paper "Sharing" page: invite people with a Sniptide account
// by exact email or username, change what they can do, or take their access away. On phones it
// sits at the bottom of the screen like a sheet.
export function ShareDialog({
  slug,
  title,
  visibility,
  owner,
  people: initialPeople,
  trigger,
  webhookTargets = [],
  webhookAllowed = false,
}: {
  slug: string
  title: string
  visibility: Visibility
  owner: { id: string; name: string; handle: string; initials: string }
  people: SharePerson[]
  trigger: "button" | "icon"
  webhookTargets?: WebhookTarget[]
  webhookAllowed?: boolean
}) {
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
      setError("Something went wrong. Try again.")
      return false
    }
  }

  function invite(identifier: string, access: SharePerson["access"]) {
    return new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const ok = await run(() => invitePerson(slug, identifier, access), "Invitation sent")
        if (ok) track("paste_shared", { access })
        resolve(ok)
      }),
    )
  }

  function change(person: SharePerson, access: SharePerson["access"]) {
    if (access === person.access) return
    startTransition(async () => {
      await run(() => setShareAccess(slug, person.id, access), "Access updated")
    })
  }

  function remove(person: SharePerson) {
    startTransition(async () => {
      const ok = await run(() => removeShare(slug, person.id))
      if (ok) {
        showUndo({
          message: `Removed ${person.name}`,
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
          Share
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={<Button variant="ghost" size="icon-lg" aria-label="Share with people" />}
        >
          <UserPlusIcon className="size-5" />
        </DialogTrigger>
      )}
      <DialogContent
        className={cn(
          "gap-0 p-0 lg:max-w-[540px]",
          // A bottom sheet on phones.
          "max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:w-full max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:border-x-0 max-lg:border-b-0 max-lg:shadow-none max-lg:pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 bg-border lg:hidden" />
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="truncate text-xl normal-case">Share “{title}”</DialogTitle>
              <DialogDescription>Invite people with a Sniptide account.</DialogDescription>
            </div>
            <DialogClose
              aria-label="Close"
              className="-mt-1 -mr-1 hidden size-8 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 lg:flex"
            >
              <XIcon className="size-4" />
            </DialogClose>
          </div>
          <InviteField onInvite={invite} submitLabel="Invite" error={error} pending={pending} />
        </div>

        <div className="flex items-center justify-between border-y border-border bg-sidebar px-4 py-2.5 text-[13px] lg:px-6">
          <span className="font-medium">People with access</span>
          <span className="text-muted-foreground">
            {people.length === 0 ? "Just you" : `${people.length} invited`}
          </span>
        </div>

        <ul className="flex max-h-[40svh] flex-col divide-y divide-border overflow-y-auto">
          <li className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
            <ShareAvatar person={owner} className="size-8 text-[10px]" />
            <PersonName name={`${owner.name} (you)`} handle={owner.handle} />
            <span className="text-[13px] text-muted-foreground">Owner</span>
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
                label={`Access for ${person.name}`}
              />
            </li>
          ))}
        </ul>
        {people.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-[13px] text-muted-foreground lg:px-6">
            They'll see it under Shared with me as soon as you invite them. Remove access any time
            and it disappears for them.
          </p>
        ) : null}

        <WebhookShare slug={slug} targets={webhookTargets} allowed={webhookAllowed} />
        <div className="flex items-center justify-between gap-3 border-t border-border bg-sidebar px-4 py-3 lg:px-6">
          <span className="flex items-center gap-2 text-[13px]">
            <note.icon className="size-3.5 shrink-0" />
            {note.text}
          </span>
          <DialogClose render={<Button variant="inverted" size="lg" className="hidden lg:flex" />}>
            Done
          </DialogClose>
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
