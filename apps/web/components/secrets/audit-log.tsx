"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { cn } from "@sniptide/ui/lib/utils"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useSiteOrigin } from "@/components/site-host"
import type { AuditEntry, AuditPerson } from "@/lib/env/audit"
import { profilePath } from "@/lib/profile-path"

const code = (chunks: ReactNode) => <span className="font-mono text-[13px]">{chunks}</span>

// A person named in an entry: their profile picture, or initials without one, and display name on
// a muted chip, with the handle on hover. The chip links to the person's public profile when they
// have one. An entry with no account at all reads as plain text.
function PersonChip({ person, fallback }: { person: AuditPerson | null; fallback: string }) {
  const origin = useSiteOrigin()
  if (!person) return <span className="text-muted-foreground">{fallback}</span>
  const content = (
    <>
      <Avatar className="size-4 rounded-sm font-heading text-[7px] font-bold">
        {person.image ? <AvatarImage src={person.image} alt="" /> : null}
        <AvatarFallback>{person.initials}</AvatarFallback>
      </Avatar>
      <span className="truncate" dir="auto">
        {person.name}
      </span>
    </>
  )
  const chip =
    "inline-flex max-w-full items-center gap-1 rounded-md bg-muted py-px pr-1.5 pl-0.5 align-middle font-medium"
  if (!person.profile) {
    return (
      <span title={person.handle} className={chip}>
        {content}
      </span>
    )
  }
  return (
    <a
      href={`${origin}${profilePath(person.profile)}`}
      title={person.handle}
      className={cn(
        chip,
        "outline-none hover:bg-accent hover:text-link focus-visible:ring-2 focus-visible:ring-ring/40",
      )}
    >
      {content}
    </a>
  )
}

// Audit entries as one sentence each, with how the request arrived and when. `showGroup` adds the
// group's name on lists that span groups.
export function AuditLog({ entries, showGroup }: { entries: AuditEntry[]; showGroup?: boolean }) {
  const t = useTranslations("Secrets")
  const format = useFormatter()

  function sentence(entry: AuditEntry) {
    const unknown = t("audit_unknown_actor")
    const actor = entry.actor?.name ?? unknown
    const person = entry.person?.name ?? unknown
    const people = {
      who: () => <PersonChip person={entry.actor} fallback={unknown} />,
      whom: () => <PersonChip person={entry.person} fallback={unknown} />,
      code,
    }
    const [name] = entry.detail.variables ?? []
    const count = entry.detail.variables?.length ?? 0
    switch (entry.action) {
      case "create":
        return t.rich("audit_create", { ...people, actor })
      case "edit":
        if (count === 1 && name) return t.rich("audit_edit_one", { ...people, actor, name })
        if (count > 1) return t.rich("audit_edit_many", { ...people, actor, count })
        return t.rich("audit_edit_settings", { ...people, actor })
      case "delete":
        return t.rich("audit_delete", { ...people, actor })
      case "read":
        return entry.via === "link"
          ? t("audit_read_link")
          : t.rich("audit_read", { ...people, actor })
      case "reveal":
        return t.rich("audit_reveal", { ...people, actor, name: name ?? "" })
      case "link_create":
        return t.rich("audit_link_create", { ...people, actor })
      case "link_revoke":
        return t.rich("audit_link_revoke", { ...people, actor })
      case "grant":
        return t.rich("audit_grant", {
          ...people,
          actor,
          person,
          role: entry.detail.role ?? "read",
        })
      case "revoke":
        return t.rich("audit_revoke", { ...people, actor, person })
      case "leave":
        return t.rich("audit_leave", { ...people, actor })
    }
  }
  function source(entry: AuditEntry) {
    if (entry.via === "link") return t("audit_via_link")
    if (entry.via === "web") return t("audit_via_web")
    return entry.detail.token
      ? t("audit_via_token", { name: entry.detail.token })
      : t("audit_via_token_unknown")
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={
            showGroup
              ? "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_12rem_12rem_11rem]"
              : "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_12rem_11rem]"
          }
        >
          <span
            className="col-span-2 min-w-0 [overflow-wrap:anywhere] lg:col-span-1"
            title={
              (entry.detail.variables?.length ?? 0) > 1
                ? format.list(entry.detail.variables ?? [], { type: "conjunction" })
                : undefined
            }
          >
            {sentence(entry)}
          </span>
          {showGroup ? (
            <span
              title={entry.groupSlug}
              className="col-span-2 truncate font-mono text-[13px] lg:col-span-1"
            >
              {entry.groupSlug}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-muted-foreground" title={source(entry)}>
            {source(entry)}
          </span>
          <time
            dateTime={new Date(entry.createdAt).toISOString()}
            className="text-right whitespace-nowrap text-muted-foreground tabular-nums"
          >
            {format.dateTime(new Date(entry.createdAt), {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
              timeZoneName: "short",
            })}
          </time>
        </li>
      ))}
    </ul>
  )
}
