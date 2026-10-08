import { TrashList } from "@/components/lists/trash-list"
import { toTrashRow, trashSizeLabel } from "@/lib/pastes/rows"
import { listTrash } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Trash · Sniptide" }

export default async function Page() {
  const [pastes, { host }] = await Promise.all([listTrash(), getSiteOrigin()])
  const rows = pastes.map(toTrashRow)

  return <TrashList rows={rows} sizeLabel={trashSizeLabel(rows)} host={host} />
}
