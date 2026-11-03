import { languages } from "./languages"
import { listQueryFields, type SearchParams, type SortDirection } from "./list-query"
import { ACCESSES, type Access } from "./types"

export const SHARED_SORTS = ["shared", "updated", "title", "language", "owner", "access"] as const
export type SharedSort = (typeof SHARED_SORTS)[number]
export const DEFAULT_SHARED_DIRECTION: Record<SharedSort, SortDirection> = {
  shared: "desc",
  updated: "desc",
  title: "asc",
  language: "asc",
  owner: "asc",
  access: "asc",
}
export function sharedDirection(query: Pick<SharedListQuery, "sort" | "dir">): SortDirection {
  return query.dir ?? DEFAULT_SHARED_DIRECTION[query.sort]
}

export interface SharedListQuery {
  q: string
  languages: string[]
  owners: string[]
  access: Access[]
  sort: SharedSort
  // Only set when it differs from the sort's default direction.
  dir?: SortDirection
  page: number
}

export function parseSharedListQuery(params: SearchParams): SharedListQuery {
  const { values, first, page } = listQueryFields(params)
  const sort = SHARED_SORTS.find((value) => value === first("sort")) ?? "shared"
  const dir = first("dir")
  return {
    q: (first("q") ?? "").trim().slice(0, 120),
    languages: values("language").filter((id) => languages.some((language) => language.id === id)),
    owners: values("owner").filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id)),
    access: values("access").filter((value): value is Access =>
      ACCESSES.some((access) => access === value),
    ),
    sort,
    dir:
      (dir === "asc" || dir === "desc") && dir !== DEFAULT_SHARED_DIRECTION[sort] ? dir : undefined,
    page,
  }
}

export function sharedListSearch(query: SharedListQuery) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  for (const value of query.languages) params.append("language", value)
  for (const value of query.owners) params.append("owner", value)
  for (const value of query.access) params.append("access", value)
  if (query.sort !== "shared") params.set("sort", query.sort)
  if (query.dir && query.dir !== DEFAULT_SHARED_DIRECTION[query.sort]) params.set("dir", query.dir)
  if (query.page !== 1) params.set("page", String(query.page))
  return params.toString()
}
