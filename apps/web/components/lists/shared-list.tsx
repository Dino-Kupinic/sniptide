"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import * as React from "react"
import { LanguageLabel, LanguageMarker } from "@/components/paste/language-marker"
import type { SharedRow } from "@/lib/pastes/rows"
import type { Person } from "@/lib/pastes/types"
import { RowMenu } from "./row-menu"
import {
  FilterMenu,
  ListHeader,
  Pagination,
  QuickChips,
  SearchField,
  SortMenu,
  usePaged,
  ViewToggle,
} from "./toolbar"

const PAGE_SIZE = 10

type Sort = "shared" | "updated" | "title"
const sortOptions: { value: Sort; label: string }[] = [
  { value: "shared", label: "Recently shared" },
  { value: "updated", label: "Last updated" },
  { value: "title", label: "Title" },
]

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
        "flex size-6 shrink-0 items-center justify-center font-heading text-[9px] font-bold",
        toneClass[person.tone],
        className,
      )}
    >
      {person.initials}
    </span>
  )
}

function AccessBadge({ access }: { access: SharedRow["access"] }) {
  return access === "edit" ? (
    <Badge variant="solid" className="h-5 px-2 text-xs">
      Can edit
    </Badge>
  ) : (
    <Badge variant="muted" className="h-5 px-2 text-xs text-foreground">
      Can view
    </Badge>
  )
}

export function SharedList({
  rows,
  origin,
  host,
}: {
  rows: SharedRow[]
  origin: string
  host: string
}) {
  const [query, setQuery] = React.useState("")
  const [languages, setLanguages] = React.useState<string[]>([])
  const [people, setPeople] = React.useState<string[]>([])
  const [access, setAccess] = React.useState<string[]>([])
  const [sort, setSort] = React.useState<Sort>("shared")
  const [view, setView] = React.useState<"list" | "grid">("list")
  const [page, setPage] = React.useState(1)

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows
      .filter(
        (row) =>
          !needle ||
          row.title.toLowerCase().includes(needle) ||
          row.slug.toLowerCase().includes(needle),
      )
      .filter((row) => languages.length === 0 || languages.includes(row.language))
      .filter((row) => people.length === 0 || (row.owner && people.includes(row.owner.username)))
      .filter((row) => access.length === 0 || access.includes(row.access))
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "updated"
            ? b.updatedAt - a.updatedAt
            : b.sharedAt - a.sharedAt,
      )
  }, [rows, query, languages, people, access, sort])

  React.useEffect(() => setPage(1), [query, languages, people, access, sort])

  const paged = usePaged(filtered, page, PAGE_SIZE)
  const owners = [
    ...new Map(
      rows.flatMap((row) => (row.owner ? [[row.owner.username, row.owner] as const] : [])),
    ).values(),
  ]
  const filtering = Boolean(query || languages.length || people.length || access.length)

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title="Shared with me"
        count={rows.length}
        actions={<ViewToggle value={view} onChange={setView} />}
      />

      <div className="flex flex-col gap-3 lg:hidden">
        <SearchField value={query} onChange={setQuery} />
        <QuickChips
          label="Access"
          value={(access.length === 1 ? access[0] : "all") as "all" | "edit" | "view"}
          onChange={(next) => setAccess(next === "all" ? [] : [next])}
          options={[
            { value: "all", label: "All" },
            { value: "edit", label: "Can edit" },
            { value: "view", label: "Can view" },
          ]}
        />
      </div>

      <div className="flex flex-col lg:border lg:border-border">
        <div className="hidden items-center justify-between gap-3 p-3 lg:flex">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={query} onChange={setQuery} />
            <FilterMenu
              label="Language"
              options={[...new Set(rows.map((row) => row.language))]
                .sort()
                .map((id) => ({ value: id, label: <LanguageLabel language={id} /> }))}
              selected={languages}
              onChange={setLanguages}
            />
            <FilterMenu
              label="Shared by"
              options={owners.map((person) => ({
                value: person.username,
                label: (
                  <span className="flex items-center gap-2">
                    <PersonAvatar person={person} className="size-5" />
                    {person.name}
                  </span>
                ),
              }))}
              selected={people}
              onChange={setPeople}
            />
            <FilterMenu
              label="Access"
              options={[
                { value: "edit", label: "Can edit" },
                { value: "view", label: "Can view" },
              ]}
              selected={access}
              onChange={setAccess}
            />
          </div>
          <SortMenu value={sort} options={sortOptions} onChange={setSort} />
        </div>

        {filtered.length === 0 ? (
          <p className="border-t border-border px-4 py-14 text-center text-sm text-muted-foreground">
            {filtering
              ? "No pastes match these filters."
              : "Nobody has shared a paste with you yet."}
          </p>
        ) : view === "grid" ? (
          <ul className="hidden grid-cols-3 gap-3 border-t border-border p-3 lg:grid">
            {paged.items.map((row) => (
              <li
                key={row.slug}
                className="relative flex flex-col gap-3 border border-border p-4 hover:border-foreground/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/pastes/${row.slug}`}
                    className="text-sm font-medium after:absolute after:inset-0"
                  >
                    {row.title}
                  </Link>
                  <RowMenu row={row} origin={origin} />
                </div>
                <LanguageLabel language={row.language} className="text-[13px] text-foreground/80" />
                {row.owner ? (
                  <span className="mt-auto flex items-center gap-2 text-[13px]">
                    <PersonAvatar person={row.owner} />
                    {row.owner.name}
                  </span>
                ) : null}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <AccessBadge access={row.access} />
                  {row.sharedLabel}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Table className="hidden table-fixed lg:table">
            <TableHeader className="bg-sidebar">
              <TableRow className="hover:bg-transparent">
                <TableHead>Paste</TableHead>
                <TableHead className="w-[130px]">Language</TableHead>
                <TableHead className="w-[200px]">Shared by</TableHead>
                <TableHead className="w-[120px]">Access</TableHead>
                <TableHead className="w-[116px]">Shared</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.items.map((row) => (
                <TableRow key={row.slug} className="relative border-border/60">
                  <TableCell className="truncate">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/pastes/${row.slug}`}
                        className="truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                      >
                        {row.title}
                      </Link>
                      {row.unseen ? (
                        <span className="size-1.5 shrink-0 bg-primary">
                          <span className="sr-only">New</span>
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
                      <span className="flex items-center gap-2">
                        <PersonAvatar person={row.owner} />
                        {row.owner.name}
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
                    <RowMenu row={row} origin={origin} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {filtered.length > 0 ? (
          <ul className="flex flex-col lg:hidden">
            {paged.items.map((row) => (
              <li
                key={row.slug}
                className="relative flex items-center gap-3 border-b border-border py-3"
              >
                <LanguageMarker language={row.language} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    href={`/pastes/${row.slug}`}
                    className="text-[15px] font-medium after:absolute after:inset-0"
                  >
                    {row.title}
                  </Link>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {row.owner?.name} · {row.sharedLabel}
                  </span>
                </div>
                <AccessBadge access={row.access} />
              </li>
            ))}
          </ul>
        ) : null}

        {filtered.length > 0 ? (
          <div className="flex items-center justify-between gap-3 py-3 lg:border-t lg:border-border lg:px-4">
            <span className="hidden text-[13px] text-muted-foreground lg:inline">
              {filtered.length} {filtered.length === 1 ? "paste" : "pastes"} from{" "}
              {new Set(filtered.map((row) => row.owner?.username)).size}{" "}
              {new Set(filtered.map((row) => row.owner?.username)).size === 1 ? "person" : "people"}
            </span>
            <Pagination page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
