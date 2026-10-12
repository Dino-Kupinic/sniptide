"use client"

import { UsersIcon } from "lucide-react"
import * as React from "react"
import { findPerson } from "@/lib/pastes/actions"
import type { Access, SharePerson } from "@/lib/pastes/types"
import { AccessMenu, InviteField, RemoveButton, ShareAvatar } from "./share-people"

export type PendingInvite = { person: Omit<SharePerson, "access" | "sharedAt">; access: Access }

// "Invite people" under Visibility on New paste, shown while Private is picked. Each person is
// looked up as they're added; the paste is shared with them when it's created.
export function InvitePeople({
  invites,
  onChange,
  large,
}: {
  invites: PendingInvite[]
  onChange: (invites: PendingInvite[]) => void
  large?: boolean
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function add(identifier: string, access: Access) {
    return new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const result = await findPerson(identifier)
        if (!result.ok) {
          setError(result.error)
          resolve(false)
          return
        }
        setError(null)
        onChange([
          ...invites.filter((invite) => invite.person.id !== result.person.id),
          { person: result.person, access },
        ])
        resolve(true)
      }),
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className={large ? "flex items-center gap-2 text-[15px]" : "flex items-center gap-2"}>
          <UsersIcon className="size-4" />
          Invite people
        </span>
        <span className="text-xs text-muted-foreground">Optional</span>
      </div>
      <InviteField onInvite={add} error={error} pending={pending} compact={!large} />
      {invites.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {invites.map((invite) => (
            <li key={invite.person.id} className="flex items-center gap-2 py-1.5">
              <ShareAvatar person={invite.person} className="size-5" />
              <span className="min-w-0 flex-1 truncate" title={invite.person.handle}>
                {invite.person.name}
              </span>
              <AccessMenu
                value={invite.access}
                onChange={(access) =>
                  onChange(
                    invites.map((other) =>
                      other.person.id === invite.person.id ? { ...other, access } : other,
                    ),
                  )
                }
                label={`Access for ${invite.person.name}`}
                className="text-muted-foreground"
              />
              <RemoveButton
                label={`Don't invite ${invite.person.name}`}
                onClick={() =>
                  onChange(invites.filter((other) => other.person.id !== invite.person.id))
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {invites.length > 0
          ? "They get it in Shared with me when you create the paste."
          : "Press Enter to add someone with a Sniptide account."}
      </p>
    </div>
  )
}
