import { getLocale, getTranslations } from "next-intl/server"
import { TrashList } from "@/components/lists/trash-list"
import { formatBytes } from "@/lib/format"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage, trashTotals } from "@/lib/pastes/lists"
import { toTrashRow } from "@/lib/pastes/rows"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("trash")} · Sniptide` }
}

export default async function Page({ searchParams }: PageProps<"/trash">) {
  const query = parsePasteListQuery(await searchParams)
  const [data, locale, { host }] = await Promise.all([
    listPastePage({ mode: "trash" }, query),
    getLocale(),
    getSiteOrigin(),
  ])
  const totals = await trashTotals()
  return (
    <TrashList
      rows={data.pastes.map((paste) => toTrashRow(paste, locale))}
      sizeLabel={formatBytes(totals.bytes, locale)}
      host={host}
      query={data.query}
      pagination={data.pagination}
    />
  )
}
