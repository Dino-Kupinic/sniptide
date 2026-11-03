"use client"

import { Badge } from "@sniptide/ui/components/badge"
import { Button } from "@sniptide/ui/components/button"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { ListHeader, SearchField } from "@/components/lists/toolbar"
import { NavigationLink as Link } from "@/components/navigation-link"
import type { SecretSummary } from "@/lib/env/web-store"
import { ENVIRONMENTS, type Environment } from "./client"

export type SecretListItem = SecretSummary & { updated: string }

// Every secret group, grouped by project, with an environment switch and a filter.
export function SecretList({ groups }: { groups: SecretListItem[] }) {
  const t = useTranslations("Secrets")
  const [environment, setEnvironment] = useState<Environment | "all">("all")
  const [filter, setFilter] = useState("")
  const query = filter.trim().toLowerCase()
  const shown = groups.filter(
    (group) =>
      (environment === "all" || group.environment === environment) &&
      (group.slug.includes(query) || (group.project ?? "").toLowerCase().includes(query)),
  )
  const projects = new Map<string, SecretListItem[]>()
  for (const group of shown) {
    const project = group.project ?? t("ungrouped")
    projects.set(project, [...(projects.get(project) ?? []), group])
  }
  const create = (
    <Button size="lg" render={<Link href="/secrets/new" />} nativeButton={false}>
      <PlusIcon />
      {t("new_group")}
    </Button>
  )
  return (
    <div className="ph-no-capture flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        headerActions={null}
        title={t("title")}
        count={groups.length}
        description={t("list_description")}
        actions={create}
      />
      <div className="lg:hidden">{create}</div>
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border px-4 py-14 text-center text-sm text-muted-foreground">
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
              className="sm:w-fit"
              itemClassName="px-3 whitespace-nowrap"
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
            [...projects].map(([project, items]) => (
              <section key={project} className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">{project}</h2>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {items.map((group) => (
                    <li
                      key={group.id}
                      className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_auto_8rem_8rem]"
                    >
                      <Link
                        href={`/secrets/${group.id}`}
                        title={group.slug}
                        className="min-w-0 truncate font-mono text-[13px] outline-none after:absolute after:inset-0 focus-visible:underline"
                      >
                        {group.slug}
                      </Link>
                      <Badge variant={group.environment === "prod" ? "outline" : "muted"}>
                        {group.environment ? t(group.environment) : t("no_environment")}
                      </Badge>
                      <span className="col-span-2 text-xs text-muted-foreground tabular-nums sm:col-span-1 sm:text-right sm:text-[13px]">
                        {t("variable_count", { count: group.count })}
                      </span>
                      <span className="hidden text-right text-[13px] text-muted-foreground sm:block">
                        {group.updated}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  )
}
