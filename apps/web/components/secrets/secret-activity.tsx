"use client"

import { Button } from "@sniptide/ui/components/button"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { ChevronLeftIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ListHeader } from "@/components/lists/toolbar"
import { NavigationLink as Link } from "@/components/navigation-link"
import type { AuditEntry } from "@/lib/env/audit"
import { AUDIT_FILTERS, type AuditFilter } from "@/lib/env/inputs"
import { AuditLog } from "./audit-log"

// The audit log of every secret group the account owns, or of one group when the link names it,
// filtered by kind of event and paged from the newest entry.
export function SecretActivity({
  entries,
  more,
  page,
  filter,
  group,
}: {
  entries: AuditEntry[]
  more: boolean
  page: number
  filter: AuditFilter
  group: { id: string; slug: string | null } | null
}) {
  const t = useTranslations("Secrets")
  const router = useRouter()
  const labels: Record<AuditFilter, string> = {
    all: t("audit_filter_all"),
    reads: t("audit_filter_reads"),
    changes: t("audit_filter_changes"),
    access: t("audit_filter_access"),
  }
  function href(next: { filter?: AuditFilter; page?: number }) {
    const params = new URLSearchParams()
    if (group) params.set("group", group.id)
    const nextFilter = next.filter ?? filter
    if (nextFilter !== "all") params.set("filter", nextFilter)
    if (next.page) params.set("page", String(next.page))
    const query = params.toString()
    return query ? `/secrets/activity?${query}` : "/secrets/activity"
  }
  return (
    <div className="ph-no-capture flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <div className="flex flex-col gap-3">
        <Link
          href={group ? `/secrets/${group.id}` : "/secrets"}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          {group?.slug ?? t("back")}
        </Link>
        <ListHeader
          title={t("audit_title")}
          description={
            group?.slug ? t("audit_one_description", { name: group.slug }) : t("audit_description")
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label={t("audit_filter")}
          className="sm:w-fit"
          itemClassName="px-3 whitespace-nowrap"
          value={filter}
          onValueChange={(value) => router.push(href({ filter: value, page: 0 }))}
          options={AUDIT_FILTERS.map((value) => ({ value, label: labels[value] }))}
        />
        {group ? (
          <Link href="/secrets/activity" className="text-sm font-medium text-link hover:underline">
            {t("audit_all_groups")}
          </Link>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-border px-4 py-14 text-center text-sm text-muted-foreground">
          {filter === "all" && page === 0 ? t("audit_empty") : t("audit_empty_filter")}
        </p>
      ) : (
        <AuditLog entries={entries} showGroup={!group} />
      )}
      {page > 0 || more ? (
        <nav aria-label={t("audit_pages")} className="flex justify-between gap-2">
          {page > 0 ? (
            <Button
              variant="outline"
              render={<Link href={href({ page: page - 1 })} />}
              nativeButton={false}
            >
              {t("audit_newer")}
            </Button>
          ) : (
            <span />
          )}
          {more ? (
            <Button
              variant="outline"
              render={<Link href={href({ page: page + 1 })} />}
              nativeButton={false}
            >
              {t("audit_older")}
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}
