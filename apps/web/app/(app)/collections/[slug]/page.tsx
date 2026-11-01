import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CollectionMenu } from "@/components/collections/collection-menu"
import { PasteList } from "@/components/lists/paste-list"
import { getCollection, listCollections } from "@/lib/collections/store"
import { cardPreviews } from "@/lib/pastes/card-preview"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { toRows } from "@/lib/pastes/rows"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">) {
  const collection = await getCollection((await params).slug)
  const t = await getTranslations("Core")
  return { title: `${collection?.name ?? t("collection")} · Sniptide` }
}

export default async function Page({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const locale = await getLocale()
  const { slug } = await params
  const query = parsePasteListQuery(await searchParams)
  const [collection, collections, data, { origin, host }] = await Promise.all([
    getCollection(slug),
    listCollections(),
    listPastePage({ mode: "collection", collection: slug }, query),
    getSiteOrigin(),
  ])
  if (!collection) notFound()

  const [rows, previews] = await Promise.all([
    toRows(data.pastes, locale),
    cardPreviews(data.pastes),
  ])

  return (
    <PasteList
      title={collection.name}
      mode="collection"
      rows={rows}
      previews={previews}
      origin={origin}
      host={host}
      // For the selection bar's Move to collection.
      collections={collections}
      collection={collection.slug}
      query={data.query}
      pagination={data.pagination}
      languageOptions={data.languageOptions}
      actions={<CollectionMenu collection={collection} afterDelete="/collections" />}
    />
  )
}
