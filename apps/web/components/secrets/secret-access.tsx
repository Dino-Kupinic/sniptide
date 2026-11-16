"use client"

import { FormError } from "@sniptide/ui/components/form-error"
import { toast } from "@sniptide/ui/components/toast"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { AccessMenu, InviteField } from "@/components/paste/share-people"
import { UserAvatar } from "@/components/people/user-avatar"
import type { MemberRole } from "@/lib/env/inputs"
import type { SecretDetail } from "@/lib/env/web-store"
import { findPerson } from "@/lib/pastes/actions"
import type { Access } from "@/lib/pastes/types"
import { SecretRequestError, useSecretRequest } from "./client"
import { Panel } from "./panel"

// The people controls are shared with paste sharing, which calls the same two levels view and edit.
const roleOf = (access: Access): MemberRole => (access === "edit" ? "write" : "read")
const accessOf = (role: MemberRole): Access => (role === "write" ? "edit" : "view")

// Who else reaches a group, for its owner: add an account by email or username, change what it
// may do, or take its access away.
export function SecretAccess({ group }: { group: SecretDetail }) {
  const t = useTranslations("Secrets")
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function change(command: Record<string, unknown>, task: string, success: string) {
    setBusy(task)
    setError(null)
    try {
      await secretRequest({ ...command, id: group.id })
      toast.success(success)
      router.refresh()
      return true
    } catch (error) {
      setError(error instanceof SecretRequestError ? error.message : t("grant_error"))
      return false
    } finally {
      setBusy(null)
    }
  }
  async function add(identifier: string, access: Access) {
    setBusy("add")
    setError(null)
    const found = await findPerson(identifier)
    if (!found.ok) {
      setError(found.error)
      setBusy(null)
      return false
    }
    return change(
      { operation: "grant", userId: found.person.id, role: roleOf(access) },
      "add",
      t("access_granted", { name: found.person.name || found.person.handle }),
    )
  }

  return (
    <Panel title={t("access")} description={t("access_description")}>
      <div className="flex flex-col gap-4">
        <InviteField
          onInvite={add}
          submitLabel={t("access_add")}
          error={null}
          pending={busy === "add"}
        />
        <FormError message={error} />
        {group.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("access_empty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {group.members.map((member) => {
              const name = member.name || member.handle
              return (
                <li key={member.id} className="flex items-center gap-3 px-4 py-2">
                  <UserAvatar person={member} className="size-6" />
                  <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="truncate text-sm font-medium" dir="auto">
                      {name}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">{member.handle}</span>
                  </span>
                  <AccessMenu
                    value={accessOf(member.role)}
                    disabled={busy === member.id}
                    label={t("access_for", { name })}
                    onChange={(access) => {
                      if (roleOf(access) !== member.role)
                        void change(
                          { operation: "grant", userId: member.id, role: roleOf(access) },
                          member.id,
                          t("access_changed", { name }),
                        )
                    }}
                    onRemove={() =>
                      void change(
                        { operation: "remove_access", userId: member.id },
                        member.id,
                        t("access_removed", { name }),
                      )
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}
