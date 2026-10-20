import { languages } from "./languages"
import { listQueryFields, type SearchParams } from "./list-query"
import { ACCESSES, type Access } from "./types"

export const SHARED_SORTS = ["shared", "updated", "title"] as const

export interface SharedListQuery {
  q: string
  languages: string[]
  owners: string[]
  access: Access[]
  sort: (typeof SHARED_SORTS)[number]
  page: number
}

export function parseSharedListQuery(params: SearchParams): SharedListQuery {
  const { values, first, page } = listQueryFields(params)
  return {
    q: (first("q") ?? "").trim().slice(0, 120),
    languages: values("language").filter((id) => languages.some((language) => language.id === id)),
    owners: values("owner").filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id)),
    access: values("access").filter((value): value is Access =>
      ACCESSES.some((access) => access === value),
    ),
    sort: SHARED_SORTS.find((sort) => sort === first("sort")) ?? "shared",
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
  if (query.page !== 1) params.set("page", String(query.page))
  return params.toString()
}
