import { getLocale, getTranslations } from "next-intl/server"
import { SharedList } from "@/components/lists/shared-list"
import type { SearchParams } from "@/lib/pastes/list-query"
import { listSharedPage } from "@/lib/pastes/lists"
import { toSharedRows } from "@/lib/pastes/rows"
import { parseSharedListQuery } from "@/lib/pastes/shared-list-query"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("shared")} · Sniptide` }
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const locale = await getLocale()
  const [result, { origin, host }] = await Promise.all([
    listSharedPage(parseSharedListQuery(await searchParams)),
    getSiteOrigin(),
  ])
  const rows = await toSharedRows(result.entries, locale)

  return (
    <SharedList
      rows={rows}
      query={result.query}
      pagination={result.pagination}
      languageOptions={result.languageOptions}
      ownerOptions={result.ownerOptions}
      peopleCount={result.peopleCount}
      origin={origin}
      host={host}
    />
  )
}
