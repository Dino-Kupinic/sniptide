import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { FolderIntro } from "@/components/folders/folder-intro"
import { FolderMenu } from "@/components/folders/folder-menu"
import { PasteList } from "@/components/lists/paste-list"
import { listCollections } from "@/lib/collections/store"
import { listFolders } from "@/lib/folders/store"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { toRows } from "@/lib/pastes/rows"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/folders/[id]">) {
  const id = (await params).id
  const folder = (await listFolders()).find((candidate) => candidate.id === id)
  const t = await getTranslations("Core")
  return { title: `${folder?.name ?? t("folder")} · Sniptide` }
}

export default async function Page({ params, searchParams }: PageProps<"/folders/[id]">) {
  const locale = await getLocale()
  const { id } = await params
  const query = parsePasteListQuery(await searchParams)
  const [folders, data, collections, { origin, host }] = await Promise.all([
    listFolders(),
    listPastePage({ mode: "folder", folder: id }, query),
    listCollections(),
    getSiteOrigin(),
  ])
  const folder = folders.find((candidate) => candidate.id === id)
  if (!folder) notFound()

  const rows = await toRows(data.pastes, locale)

  return (
    <PasteList
      title={folder.name}
      mode="folder"
      rows={rows}
      origin={origin}
      host={host}
      collections={collections}
      query={data.query}
      pagination={data.pagination}
      languageOptions={data.languageOptions}
      intro={<FolderIntro folder={folder} folders={folders} />}
      actions={<FolderMenu folder={folder} folders={folders} />}
    />
  )
}
