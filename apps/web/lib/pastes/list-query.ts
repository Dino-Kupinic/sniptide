import { languages } from "./languages"

export const PASTE_PAGE_SIZE = 10
export const PASTE_SORTS = [
  "updated",
  "views",
  "expires",
  "title",
  "language",
  "visibility",
] as const
export type PasteSort = (typeof PASTE_SORTS)[number]
export type SortDirection = "asc" | "desc"
// Each sort starts in the direction that answers its natural question (newest, most viewed,
// soonest, A to Z). A header click flips it, and the URL only carries a flipped direction.
export const DEFAULT_SORT_DIRECTION: Record<PasteSort, SortDirection> = {
  updated: "desc",
  views: "desc",
  expires: "asc",
  title: "asc",
  language: "asc",
  visibility: "asc",
}
export function sortDirection(query: Pick<PasteListQuery, "sort" | "dir">): SortDirection {
  return query.dir ?? DEFAULT_SORT_DIRECTION[query.sort]
}
export type VisibilityFilter = "public" | "unlisted" | "private" | "burn"
export type SearchParams = Record<string, string | string[] | undefined>

export interface PasteListQuery {
  q: string
  languages: string[]
  visibility: VisibilityFilter[]
  collections: string[]
  owner: "all" | "mine" | "shared"
  sort: PasteSort
  // Only set when it differs from the sort's default direction.
  dir?: SortDirection
  page: number
  cursor?: string
}

export interface PageInfo {
  page: number
  pageCount: number
  total: number
  totalAll: number
  nextCursor?: string
  previousCursor?: string
}

// Bounded query inputs shared by list pages. Repeated parameters and comma-separated values
// both work, so a filtered view can be bookmarked or opened in another tab.
export function parsePasteListQuery(params: SearchParams): PasteListQuery {
  const { values, first, page } = listQueryFields(params)
  const sort = PASTE_SORTS.find((value) => value === first("sort")) ?? "updated"
  const dir = first("dir") === "asc" || first("dir") === "desc" ? first("dir") : undefined
  return {
    cursor: first("cursor")?.slice(0, 2048),
    q: (first("q") ?? "").trim().slice(0, 120),
    languages: values("language").filter((id) => languages.some((language) => language.id === id)),
    visibility: values("visibility").filter((value): value is VisibilityFilter =>
      ["public", "unlisted", "private", "burn"].includes(value),
    ),
    collections: values("collection").filter((value) => /^[a-z0-9-]{1,40}$/.test(value)),
    owner: first("owner") === "mine" ? "mine" : first("owner") === "shared" ? "shared" : "all",
    sort,
    dir: dir === DEFAULT_SORT_DIRECTION[sort] ? undefined : (dir as SortDirection | undefined),
    page,
  }
}

export function pasteListSearch(query: PasteListQuery) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  for (const value of query.languages) params.append("language", value)
  for (const value of query.visibility) params.append("visibility", value)
  for (const value of query.collections) params.append("collection", value)
  if (query.owner !== "all") params.set("owner", query.owner)
  if (query.sort !== "updated") params.set("sort", query.sort)
  if (query.dir && query.dir !== DEFAULT_SORT_DIRECTION[query.sort]) params.set("dir", query.dir)
  if (query.page !== 1) params.set("page", String(query.page))
  if (query.cursor) params.set("cursor", query.cursor)
  return params.toString()
}

export function listQueryFields(params: SearchParams) {
  const values = (key: string) =>
    [...new Set([params[key]].flat().flatMap((value) => value?.split(",") ?? []))].slice(0, 50)
  const first = (key: string) => [params[key]].flat()[0]
  const requestedPage = Number(first("page"))
  return {
    values,
    first,
    page:
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? Math.min(requestedPage, 1_000_000)
        : 1,
  }
}
