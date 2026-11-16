"use client"

import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import type { AuditEntry } from "@/lib/env/audit"

const code = (chunks: ReactNode) => <span className="font-mono text-[13px]">{chunks}</span>

// Audit entries as one sentence each, with how the request arrived and when. `showGroup` adds the
// group's name on lists that span groups.
export function AuditLog({ entries, showGroup }: { entries: AuditEntry[]; showGroup?: boolean }) {
  const t = useTranslations("Secrets")
  const format = useFormatter()

  function sentence(entry: AuditEntry) {
    const actor = entry.actor ?? t("audit_unknown_actor")
    const [name] = entry.detail.variables ?? []
    const count = entry.detail.variables?.length ?? 0
    switch (entry.action) {
      case "create":
        return t("audit_create", { actor })
      case "edit":
        if (count === 1 && name) return t.rich("audit_edit_one", { actor, name, code })
        if (count > 1) return t("audit_edit_many", { actor, count })
        return t("audit_edit_settings", { actor })
      case "delete":
        return t("audit_delete", { actor })
      case "read":
        return entry.via === "link" ? t("audit_read_link") : t("audit_read", { actor })
      case "reveal":
        return t.rich("audit_reveal", { actor, name: name ?? "", code })
      case "link_create":
        return t("audit_link_create", { actor })
      case "link_revoke":
        return t("audit_link_revoke", { actor })
      case "grant":
        return t("audit_grant", {
          actor,
          person: entry.detail.person ?? t("audit_unknown_actor"),
          role: entry.detail.role ?? "read",
        })
      case "revoke":
        return t("audit_revoke", {
          actor,
          person: entry.detail.person ?? t("audit_unknown_actor"),
        })
      case "leave":
        return t("audit_leave", { actor })
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
