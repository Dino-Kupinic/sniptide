import { TrashList } from "@/components/lists/trash-list"
import { formatBytes } from "@/lib/format"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage, trashTotals } from "@/lib/pastes/lists"
import { toTrashRow } from "@/lib/pastes/rows"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Trash · Sniptide" }

export default async function Page({ searchParams }: PageProps<"/trash">) {
  const query = parsePasteListQuery(await searchParams)
  const data = await listPastePage({ mode: "trash" }, query)
  const [totals, { host }] = await Promise.all([trashTotals(), getSiteOrigin()])
  return (
    <TrashList
      rows={data.pastes.map(toTrashRow)}
      sizeLabel={formatBytes(totals.bytes)}
      host={host}
      query={data.query}
      pagination={data.pagination}
    />
  )
}
