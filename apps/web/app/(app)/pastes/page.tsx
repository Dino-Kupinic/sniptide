import { ImportGistButton } from "@/components/lists/import-gist"
import { PasteList } from "@/components/lists/paste-list"
import { collections } from "@/lib/mock-data"
import { toRow } from "@/lib/pastes/rows"
import { listOwnPastes } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "My pastes · Sniptide" }

export default async function Page() {
  const [pastes, { origin, host }] = await Promise.all([listOwnPastes(), getSiteOrigin()])
  const rows = await Promise.all(pastes.map((paste) => toRow(paste)))

  return (
    <PasteList
      title="My pastes"
      mode="mine"
      rows={rows}
      origin={origin}
      host={host}
      collections={collections}
      actions={<ImportGistButton />}
    />
  )
}
