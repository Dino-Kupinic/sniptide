import { ImportGistButton } from "@/components/lists/import-gist"
import { PasteList } from "@/components/lists/paste-list"
import { collections } from "@/lib/mock-data"
import { toRow } from "@/lib/pastes/rows"
import { getShare, listStarred } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Starred · Sniptide" }

export default async function Page() {
  const [pastes, { origin, host }] = await Promise.all([listStarred(), getSiteOrigin()])
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
