import { ImportGistButton } from "@/components/lists/import-gist"
import { PasteList, type Sort } from "@/components/lists/paste-list"
import { listCollections } from "@/lib/collections/store"
import { toRows } from "@/lib/pastes/rows"
import { listOwnPastes } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "My pastes · Sniptide" }

const sorts: Sort[] = ["updated", "views", "expires", "title"]

// `?sort=expires` comes from the dashboard's "Expiring in 48h · Review" link.
export default async function Page({ searchParams }: PageProps<"/pastes">) {
  const requested = (await searchParams).sort
  const initialSort = sorts.find((sort) => sort === requested) ?? "updated"
  const [pastes, { origin, host }, collections] = await Promise.all([
    listOwnPastes(),
    getSiteOrigin(),
    listCollections(),
  ])
  const rows = await toRows(pastes)

  return (
    <PasteList
      title="My pastes"
      mode="mine"
      rows={rows}
      origin={origin}
      host={host}
      collections={collections}
      actions={<ImportGistButton />}
      initialSort={initialSort}
    />
  )
}
