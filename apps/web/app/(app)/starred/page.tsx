import { ImportGistButton } from "@/components/lists/import-gist"
import { PasteList } from "@/components/lists/paste-list"
import { listCollections } from "@/lib/collections/store"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { toRows } from "@/lib/pastes/rows"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Starred · Sniptide" }

export default async function Page({ searchParams }: PageProps<"/starred">) {
  const query = parsePasteListQuery(await searchParams)
  const [data, { origin, host }, collections] = await Promise.all([
    listPastePage({ mode: "starred" }, query),
    getSiteOrigin(),
    listCollections(),
  ])
  return (
    <PasteList
      title="Starred"
      mode="starred"
      rows={await toRows(data.pastes)}
      origin={origin}
      host={host}
      collections={collections}
      actions={<ImportGistButton />}
      query={data.query}
      pagination={data.pagination}
      languageOptions={data.languageOptions}
    />
  )
}
