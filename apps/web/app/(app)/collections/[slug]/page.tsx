import { notFound } from "next/navigation"
import { CollectionMenu } from "@/components/collections/collection-menu"
import { PasteList } from "@/components/lists/paste-list"
import { getCollection } from "@/lib/collections/store"
import { toRows } from "@/lib/pastes/rows"
import { listOwnPastes } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">) {
  const collection = await getCollection((await params).slug)
  return { title: `${collection?.name ?? "Collection"} · Sniptide` }
}

export default async function Page({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params
  const [collection, pastes, { origin, host }] = await Promise.all([
    getCollection(slug),
    listOwnPastes(),
    getSiteOrigin(),
  ])
  if (!collection) notFound()

  const rows = await toRows(pastes.filter((paste) => paste.collection === slug))

  return (
    <PasteList
      title={collection.name}
      mode="collection"
      rows={rows}
      origin={origin}
      host={host}
      collections={[]}
      actions={<CollectionMenu collection={collection} afterDelete="/collections" />}
    />
  )
}
