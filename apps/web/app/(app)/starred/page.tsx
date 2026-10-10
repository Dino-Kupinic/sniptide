import { ImportGistButton } from "@/components/lists/import-gist"
import { PasteList } from "@/components/lists/paste-list"
import { listCollections } from "@/lib/collections/store"
import { toRows } from "@/lib/pastes/rows"
import { listStarred } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Starred · Sniptide" }

export default async function Page() {
  const [pastes, { origin, host }, collections] = await Promise.all([
    listStarred(),
    getSiteOrigin(),
    listCollections(),
  ])
  // Only your own starred pastes are editable until sharing with edit access exists.
  const rows = await toRows(pastes)

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
