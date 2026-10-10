import { notFound } from "next/navigation"
import { CollectionMenu } from "@/components/collections/collection-menu"
import { PasteList } from "@/components/lists/paste-list"
import { getCollection } from "@/lib/collections/store"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { toRows } from "@/lib/pastes/rows"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">) {
  const collection = await getCollection((await params).slug)
  return { title: `${collection?.name ?? "Collection"} · Sniptide` }
}

export default async function Page({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params
  const query = parsePasteListQuery(await searchParams)
  const [collection, data, { origin, host }] = await Promise.all([
    getCollection(slug),
    listPastePage({ mode: "collection", collection: slug }, query),
    getSiteOrigin(),
  ])
  if (!collection) notFound()

  const rows = await toRows(data.pastes)

  return (
    <PasteList
      title={collection.name}
      mode="collection"
      rows={rows}
      origin={origin}
      host={host}
      collections={[]}
      query={data.query}
      pagination={data.pagination}
      languageOptions={data.languageOptions}
      actions={<CollectionMenu collection={collection} afterDelete="/collections" />}
    />
  )
}
