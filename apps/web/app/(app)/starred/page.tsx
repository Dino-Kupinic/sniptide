import { ImportGistButton } from "@/components/lists/import-gist"
import { PasteList } from "@/components/lists/paste-list"
import { listCollections } from "@/lib/collections/store"
import { toRow } from "@/lib/pastes/rows"
import { getShare, listStarred } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Starred · Sniptide" }

export default async function Page() {
  const [pastes, { origin, host }, collections] = await Promise.all([
    listStarred(),
    getSiteOrigin(),
    listCollections(),
  ])
  const rows = await Promise.all(
    pastes.map(async (paste) =>
      toRow(paste, !paste.owner || (await getShare(paste.slug))?.access === "edit"),
    ),
  )

  return (
    <PasteList
      title="Starred"
      mode="starred"
      rows={rows}
      origin={origin}
      host={host}
      collections={collections}
      actions={<ImportGistButton />}
    />
  )
}
