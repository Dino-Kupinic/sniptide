import { notFound } from "next/navigation"
import { PasteList } from "@/components/lists/paste-list"
import { SetBreadcrumb } from "@/components/shell/breadcrumb"
import { collections } from "@/lib/mock-data"
import { toRow } from "@/lib/pastes/rows"
import { listOwnPastes } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params
  const collection = collections.find((c) => c.slug === slug)
  return { title: `${collection?.name ?? "Collection"} · Sniptide` }
}

export default async function Page({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params
  const collection = collections.find((c) => c.slug === slug)
  if (!collection) notFound()

  const [pastes, { origin, host }] = await Promise.all([listOwnPastes(), getSiteOrigin()])
  const rows = pastes.filter((paste) => paste.collection === slug).map((paste) => toRow(paste))

  return (
    <>
      <SetBreadcrumb trail={[{ label: "Collections" }, { label: collection.name }]} />
      <PasteList
        title={collection.name}
        mode="collection"
        rows={rows}
        origin={origin}
        host={host}
        collections={collections}
      />
    </>
  )
}
