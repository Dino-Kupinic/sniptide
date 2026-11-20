"use client"

import { Badge } from "@sniptide/ui/components/badge"
import { Button } from "@sniptide/ui/components/button"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { HistoryIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { GroupedCanvas, GroupedChevron } from "@/components/lists/grouped-list"
import { ListHeader, SearchField } from "@/components/lists/toolbar"
import type { SecretSummary } from "@/lib/env/web-store"
import { ENVIRONMENTS, type Environment } from "./client"

export type SecretListItem = SecretSummary & { updated: string }

// Every secret group, grouped by project, with an environment switch and a filter.
export function SecretList({
  groups,
  loading = false,
}: {
  groups: SecretListItem[]
  // The page before its groups arrive: the title and the create action, with the list to follow.
  loading?: boolean
}) {
  const t = useTranslations("Secrets")
  const [environment, setEnvironment] = useState<Environment | "all">("all")
  const [filter, setFilter] = useState("")
  const query = filter.trim().toLowerCase()
  const shown = groups.filter(
    (group) =>
      (environment === "all" || group.environment === environment) &&
      (group.slug.includes(query) || (group.project ?? "").toLowerCase().includes(query)),
  )
  // The viewer's own groups sit under their projects, and groups other accounts shared come last.
  const projects = new Map<string, SecretListItem[]>()
  for (const group of shown.filter((group) => !group.owner)) {
    const project = group.project ?? t("ungrouped")
    projects.set(project, [...(projects.get(project) ?? []), group])
  }
  const shared = shown.filter((group) => group.owner)
  const sections = [...projects].map(([title, items]) => ({
    key: `project:${title}`,
    title,
    items,
  }))
  if (shared.length) sections.push({ key: "shared", title: t("shared_with_you"), items: shared })
  const create = (
    <>
      <Button
        size="lg"
        variant="outline"
        render={<Link href="/secrets/activity" />}
        nativeButton={false}
      >
        <HistoryIcon />
        {t("audit_title")}
      </Button>
      <Button size="lg" render={<Link href="/secrets/new" />} nativeButton={false}>
        <PlusIcon />
        {t("new_group")}
      </Button>
    </>
  )
  return (
    <div className="ph-no-capture flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        headerActions={null}
        title={t("title")}
        count={loading ? undefined : groups.length}
        topBar={!loading}
        description={t("list_description")}
        actions={create}
        // Phones keep the title on one line, so its actions shrink to icons beside it, drawn
        // like the buttons of an iOS navigation bar.
        mobileActions={
          <>
            <Button
              size="icon-lg"
              variant="ghost"
              className="size-10 text-link [&_svg:not([class*='size-'])]:size-[22px]"
              aria-label={t("audit_title")}
              render={<Link href="/secrets/activity" />}
              nativeButton={false}
            >
              <HistoryIcon strokeWidth={1.9} />
            </Button>
            <Button
              size="icon-lg"
              variant="ghost"
              className="size-10 text-link [&_svg:not([class*='size-'])]:size-6"
              aria-label={t("new_group")}
              render={<Link href="/secrets/new" />}
              nativeButton={false}
            >
              <PlusIcon strokeWidth={2} />
            </Button>
          </>
        }
      />
      <GroupedCanvas />
      {loading ? null : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg px-4 py-14 text-center text-sm text-muted-foreground max-lg:bg-card lg:border lg:border-border">
          {t("empty_list")}
          <Link href="/secrets/new" className="font-medium text-link hover:underline">
            {t("create_first_group")}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SegmentedControl
              aria-label={t("environment")}
              className="max-lg:bg-foreground/[0.06] sm:w-fit dark:max-lg:bg-muted"
              itemClassName="px-2 whitespace-nowrap max-lg:py-1.5 max-lg:text-sm max-lg:data-checked:bg-card sm:px-3"
              value={environment}
              onValueChange={setEnvironment}
              options={[
                { value: "all", label: t("all_environments") },
                ...ENVIRONMENTS.map((value) => ({ value, label: t(value) })),
              ]}
            />
            <SearchField value={filter} onChange={setFilter} placeholder={t("filter_groups")} />
          </div>
          {shown.length === 0 ? (
            <p className="rounded-lg border border-border px-4 py-14 text-center text-sm text-muted-foreground">
              {t("no_matches")}
            </p>
          ) : (
            sections.map(({ key, title, items }) => (
              <section key={key} className="flex flex-col gap-1.5 lg:gap-2">
                <h2 className="px-4 text-[13px] leading-4 text-muted-foreground lg:px-0 lg:text-sm lg:leading-5 lg:font-medium lg:text-foreground">
                  {title}
                </h2>
                <ul className="overflow-hidden rounded-lg bg-card max-lg:pl-4 lg:divide-y lg:divide-border lg:border lg:border-border lg:bg-transparent">
                  {items.map((group) => (
                    <li
                      key={group.id}
                      className="relative flex min-h-[50px] items-center gap-x-3 gap-y-1 pr-4 not-last:border-b not-last:border-border lg:grid lg:min-h-12 lg:grid-cols-[minmax(0,1fr)_auto_8rem_8rem] lg:border-b-0 lg:px-4 lg:py-3 lg:hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <Link
                          href={`/secrets/${group.id}`}
                          title={group.slug}
                          className="min-w-0 truncate font-mono text-[15px] outline-none after:absolute after:inset-0 focus-visible:underline lg:text-[13px]"
                        >
                          {group.slug}
                        </Link>
                        {group.owner ? (
                          <span className="hidden shrink-0 text-[13px] text-muted-foreground lg:inline">
                            {t("shared_by", { owner: group.owner })}
                          </span>
                        ) : null}
                      </span>
                      <Badge
                        variant={group.environment === "prod" ? "outline" : "muted"}
                        // A phone filtered to one environment shows it once, in the switch.
                        className={environment === "all" ? undefined : "max-lg:hidden"}
                      >
                        {group.environment ? t(group.environment) : t("no_environment")}
                      </Badge>
                      <span className="shrink-0 text-[15px] text-muted-foreground tabular-nums lg:text-right lg:text-[13px]">
                        {t("variable_count", { count: group.count })}
                      </span>
                      <span className="hidden text-right text-[13px] text-muted-foreground lg:block">
                        {group.updated}
                      </span>
                      <span className="lg:hidden">
                        <GroupedChevron />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <p className="px-4 text-[13px] leading-[18px] text-muted-foreground lg:hidden">
            {t("list_description")}
          </p>
        </>
      )}
    </div>
  )
}

export function SecretListLoading() {
  return <SecretList groups={[]} loading />
}
