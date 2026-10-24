"use client"

import { Badge } from "@sniptide/ui/components/badge"
import { Button } from "@sniptide/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { LanguageIcon, LanguageLabel } from "@/components/paste/language-icon"
import type { PageInfo } from "@/lib/pastes/list-query"
import type { SharedRow } from "@/lib/pastes/rows"
import { type SharedListQuery, sharedListSearch } from "@/lib/pastes/shared-list-query"
import type { Person } from "@/lib/pastes/types"
import { RowMenu } from "./row-menu"
import {
  FilterMenu,
  ListHeader,
  MobileFilterSheet,
  Pagination,
  QuickChips,
  SearchField,
  SortMenu,
  ViewToggle,
} from "./toolbar"
import { useListQuery } from "./use-list-query"

const toneClass: Record<Person["tone"], string> = {
  primary: "bg-primary text-primary-foreground",
  foreground: "bg-foreground text-background",
  muted: "bg-muted text-foreground",
}

export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md font-heading text-[9px] font-bold",
        toneClass[person.tone],
        className,
      )}
    >
      {person.initials}
    </span>
  )
}

function AccessBadge({ access }: { access: SharedRow["access"] }) {
  const t = useTranslations("Workspace")
  return access === "edit" ? (
    <Badge variant="solid" className="h-5 px-2 text-xs">
      {t("can_edit")}
    </Badge>
  ) : (
    <Badge variant="muted" className="h-5 px-2 text-xs text-foreground">
      {t("can_view")}
    </Badge>
  )
}

export function SharedList({
  rows,
  query: serverQuery,
  pagination,
  languageOptions,
  ownerOptions,
  peopleCount,
  origin,
  host,
}: {
  rows: SharedRow[]
  query: SharedListQuery
  pagination: PageInfo
  languageOptions: string[]
  ownerOptions: (Person & { id: string })[]
  peopleCount: number
  origin: string
  host: string
}) {
  const t = useTranslations("Workspace")
  const sortOptions: { value: SharedListQuery["sort"]; label: string }[] = [
    { value: "shared", label: t("recently_shared") },
    { value: "updated", label: t("last_updated") },
    { value: "title", label: t("title") },
  ]

  const { query, update, pending } = useListQuery(serverQuery, sharedListSearch)
  const [view, setView] = React.useState<"list" | "grid">("list")
  const filtering = Boolean(
    query.q || query.languages.length || query.owners.length || query.access.length,
  )

  return (
    <div aria-busy={pending} className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={t("shared_with_me")}
        count={pagination.totalAll}
        actions={<ViewToggle value={view} onChange={setView} />}
        // The grid view is desktop only.
        mobileActions={null}
      />

      <div className="flex flex-col gap-3 lg:hidden">
        <SearchField value={query.q} onChange={(q) => update({ q }, true)} />
        <QuickChips
          label={t("access")}
          value={query.access.length === 1 ? (query.access[0] ?? "all") : "all"}
          onChange={(next) => update({ access: next === "all" ? [] : [next] })}
          options={[
            { value: "all", label: t("all") },
            { value: "edit", label: t("can_edit") },
            { value: "view", label: t("can_view") },
          ]}
          trailing={
            <MobileFilterSheet
              sort={{
                value: query.sort,
                defaultValue: "shared" as SharedListQuery["sort"],
                options: sortOptions,
                onChange: (sort) => update({ sort }),
              }}
              filters={[
                {
                  id: "language",
                  label: t("language"),
                  options: languageOptions.map((id) => ({
                    value: id,
                    label: <LanguageLabel language={id} />,
                  })),
                  selected: query.languages,
                  onChange: (languages) => update({ languages }),
                },
                {
                  id: "owner",
                  label: t("shared_by"),
                  options: ownerOptions.map((person) => ({
                    value: person.id,
                    label: person.name || person.username,
                  })),
                  selected: query.owners,
                  onChange: (owners) => update({ owners }),
                },
              ]}
              total={pagination.total}
              pending={pending}
              onClear={() => update({ sort: "shared", languages: [], owners: [] })}
            />
          }
        />
      </div>

      {/* The filters sit above the table on the page, and the table gets its own card. */}
      <div className="flex flex-col gap-3">
        <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={query.q} onChange={(q) => update({ q }, true)} />
            <FilterMenu
              label={t("language")}
              options={languageOptions.map((id) => ({
                value: id,
                label: <LanguageLabel language={id} />,
              }))}
              selected={query.languages}
              onChange={(languages) => update({ languages })}
            />
            <FilterMenu
              label={t("shared_by")}
              options={ownerOptions.map((person) => ({
                value: person.id,
                label: (
                  <span className="flex items-center gap-2">
                    <PersonAvatar person={person} className="size-5" />
                    {person.name}
                  </span>
                ),
              }))}
              selected={query.owners}
              onChange={(owners) => update({ owners })}
            />
            <FilterMenu
              label={t("access")}
              options={[
                { value: "edit", label: t("can_edit") },
                { value: "view", label: t("can_view") },
              ]}
              selected={query.access}
              onChange={(access) =>
                update({
                  access: access.filter(
                    (value): value is SharedRow["access"] => value === "edit" || value === "view",
                  ),
                })
              }
            />
          </div>
          <SortMenu
            value={query.sort}
            options={sortOptions}
            onChange={(sort) => update({ sort })}
          />
        </div>

        <div
          className={cn(
            "flex flex-col",
            view !== "grid" && "lg:overflow-hidden lg:rounded-lg lg:border lg:border-border",
          )}
        >
          {pagination.total === 0 ? (
            filtering ? (
              <p className="px-4 py-14 text-center text-sm text-muted-foreground">
                {t("no_pastes_match_these_filters")}
              </p>
            ) : (
              <div className="flex flex-col items-start gap-3 py-10 lg:px-8 lg:py-14">
                <div className="flex flex-col gap-1">
                  <p className="text-base font-medium">{t("nothing_shared_with_you_yet")}</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {t("when_someone_invites_you_to_a_private_paste")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  render={<Link href="/pastes" />}
                  nativeButton={false}
                >
                  {t("share_one_of_your_pastes")}
                </Button>
              </div>
            )
          ) : view === "grid" ? (
            <ul className="hidden grid-cols-2 gap-3 xl:grid-cols-3 lg:grid">
              {rows.map((row) => (
                <li
                  key={row.slug}
                  className="rounded-lg relative flex min-w-0 flex-col gap-3 border border-border p-4 hover:border-foreground/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/pastes/${row.slug}`}
                      title={row.title}
                      className="min-w-0 flex-1 line-clamp-2 [overflow-wrap:anywhere] text-sm font-medium after:absolute after:inset-0"
                    >
                      {row.title}
                    </Link>
                    <RowMenu row={row} origin={origin} shared />
                  </div>
                  <LanguageLabel
                    language={row.language}
                    className="text-[13px] text-foreground/80"
                  />
                  {row.owner ? (
                    <span className="mt-auto flex min-w-0 items-start gap-2 text-[13px]">
                      <PersonAvatar person={row.owner} />
                      <span
                        dir="auto"
                        title={row.owner.name || row.owner.username}
                        className="min-w-0 [overflow-wrap:anywhere] whitespace-normal"
                      >
                        {row.owner.name || row.owner.username}
                      </span>
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <AccessBadge access={row.access} />
                    {row.sharedLabel}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Table className="hidden min-w-[960px] table-fixed lg:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("paste")}</TableHead>
                  <TableHead className="w-[130px]">{t("language")}</TableHead>
                  <TableHead className="w-[200px]">{t("shared_by")}</TableHead>
                  <TableHead className="w-[120px]">{t("access")}</TableHead>
                  <TableHead className="w-[116px]">{t("shared")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.slug} className="relative">
                    <TableCell className="truncate">
                      <span className="flex items-center gap-2">
                        <Link
                          href={`/pastes/${row.slug}`}
                          title={row.title}
                          className="min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                        >
                          {row.title}
                        </Link>
                        {row.unseen ? (
                          <span className="size-1.5 shrink-0 bg-primary">
                            <span className="sr-only">{t("new")}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {host}/{row.slug}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] text-foreground/80">
                      <LanguageLabel language={row.language} />
                    </TableCell>
                    <TableCell className="text-[13px]">
                      {row.owner ? (
                        <span className="flex min-w-0 items-start gap-2">
                          <PersonAvatar person={row.owner} />
                          <span
                            dir="auto"
                            title={row.owner.name || row.owner.username}
                            className="min-w-0 [overflow-wrap:anywhere] whitespace-normal"
                          >
                            {row.owner.name || row.owner.username}
                          </span>
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <AccessBadge access={row.access} />
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {row.sharedLabel}
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <RowMenu row={row} origin={origin} shared />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pagination.total > 0 ? (
            <ul className="flex flex-col lg:hidden">
              {rows.map((row) => (
                <li
                  key={row.slug}
                  className="relative flex items-center gap-3 border-b border-border py-3"
                >
                  <LanguageIcon language={row.language} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/pastes/${row.slug}`}
                        title={row.title}
                        className="min-w-0 truncate text-[15px] font-medium after:absolute after:inset-0"
                      >
                        {row.title}
                      </Link>
                      {row.unseen ? (
                        <span className="size-1.5 shrink-0 bg-primary">
                          <span className="sr-only">{t("new")}</span>
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {row.owner ? `${row.owner.name || row.owner.username} · ` : ""}
                      {row.access === "edit" ? t("can_edit") : t("can_view")}
                      {" · "}
                      {row.sharedLabel}
                    </span>
                  </div>
                  <RowMenu row={row} origin={origin} shared variant="sheet" />
                </li>
              ))}
            </ul>
          ) : null}

          {pagination.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 lg:border-t lg:border-border lg:px-5">
              <span className="text-[13px] text-muted-foreground">
                {t("shared_summary", {
                  count: pagination.total,
                  people: peopleCount,
                })}
              </span>
              <Pagination
                page={pagination.page}
                pageCount={pagination.pageCount}
                onChange={(page) => update({ page })}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
