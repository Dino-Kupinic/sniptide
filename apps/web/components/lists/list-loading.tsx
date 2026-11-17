"use client"

import { useParams, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { LoadingStatus } from "@/components/loading/status"
import { useSidebarState } from "@/components/shell/app-shell"
import { useSettledShellData } from "@/components/shell/shell-data"
import { firstPageRows, type ListPage } from "@/components/shell/sidebar-state"
import { PASTE_PAGE_SIZE, parsePasteListQuery } from "@/lib/pastes/list-query"
import { parseSharedListQuery } from "@/lib/pastes/shared-list-query"
import { ImportGistButton } from "./import-gist"
import { PasteList } from "./paste-list"
import { SharedList } from "./shared-list"
import { TrashList } from "./trash-list"

// The filters, sort and page a list was asked for, read from the address so the controls show
// them while the rows load.
function useRequestedQuery() {
  const params = useSearchParams()
  const values: Record<string, string[]> = {}
  for (const [key, value] of params) values[key] = [...(values[key] ?? []), value]
  return values
}

// What is known about a list before its page arrives: its size once the shell's data is in, and
// before that the rows it opened with last time. With neither it counts as one full page, so it
// never shows its empty state by mistake.
function useKnownList(page: ListPage | null, total: number | undefined, current: number) {
  const remembered = useSidebarState().shape.pages
  const rows =
    total === undefined ? ((page && remembered[page]) ?? PASTE_PAGE_SIZE) : firstPageRows(total)
  const known = total ?? rows
  return {
    rows,
    pagination: {
      page: current,
      pageCount: Math.ceil(known / PASTE_PAGE_SIZE),
      total: known,
      totalAll: known,
    },
  }
}

// A paste list before its rows arrive. It is the list itself, with its title, filters and
// column headers in place, so the only thing that changes when the data lands is the rows.
export function PasteListLoading({
  mode,
  collection,
}: {
  mode: "mine" | "starred" | "collection"
  // The collection's slug, in collection mode.
  collection?: string
}) {
  const t = useTranslations("Core")
  const shell = useSettledShellData()
  const query = parsePasteListQuery(useRequestedQuery())
  const current = shell?.collections.find((item) => item.slug === collection)
  const total =
    mode === "mine"
      ? shell?.sidebar.counts.pastes
      : mode === "starred"
        ? shell?.sidebar.counts.starred
        : current?.pasteCount
  const list = useKnownList(
    mode === "mine" ? "pastes" : mode === "starred" ? "starred" : null,
    total,
    query.page,
  )
  const title =
    mode === "mine" ? t("pastes") : mode === "starred" ? t("starred") : (current?.name ?? "")

  return (
    <>
      <LoadingStatus />
      <PasteList
        loading={list.rows}
        title={title}
        mode={mode}
        rows={[]}
        origin=""
        collections={shell?.collections ?? []}
        collection={collection}
        actions={mode === "collection" ? undefined : <ImportGistButton />}
        mobileActions={mode === "collection" ? undefined : <ImportGistButton compact />}
        query={query}
        pagination={list.pagination}
        languageOptions={[]}
      />
    </>
  )
}

export function SharedListLoading() {
  const total = useSettledShellData()?.sidebar.counts.shared
  const query = parseSharedListQuery(useRequestedQuery())
  const list = useKnownList("shared", total, query.page)
  return (
    <>
      <LoadingStatus />
      <SharedList
        loading={list.rows}
        rows={[]}
        query={query}
        pagination={list.pagination}
        languageOptions={[]}
        ownerOptions={[]}
        peopleCount={0}
        origin=""
        host=""
      />
    </>
  )
}

export function TrashListLoading() {
  const total = useSettledShellData()?.trashCount
  const query = parsePasteListQuery(useRequestedQuery())
  const list = useKnownList("trash", total, query.page)
  return (
    <>
      <LoadingStatus />
      <TrashList
        loading={list.rows}
        rows={[]}
        sizeLabel=""
        host=""
        query={query}
        pagination={list.pagination}
      />
    </>
  )
}

// A collection's page reads its slug from the address, since the collection itself is part of
// what is loading.
export function CollectionListLoading() {
  const { slug } = useParams<{ slug: string }>()
  return <PasteListLoading mode="collection" collection={slug} />
}
