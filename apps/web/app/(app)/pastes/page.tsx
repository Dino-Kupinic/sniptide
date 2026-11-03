import { getLocale, getTranslations } from "next-intl/server"
import { ImportGistButton } from "@/components/lists/import-gist"
import { PasteList } from "@/components/lists/paste-list"
import { listCollections } from "@/lib/collections/store"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { toRows } from "@/lib/pastes/rows"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("pastes")} · Sniptide` }
}

export default async function Page({ searchParams }: PageProps<"/pastes">) {
  const query = parsePasteListQuery(await searchParams)
  const [data, { origin, host }, collections, locale, t] = await Promise.all([
    listPastePage({ mode: "mine" }, query),
    getSiteOrigin(),
    listCollections(),
    getLocale(),
    getTranslations("Core"),
  ])
  return (
    <PasteList
      title={t("pastes")}
      mode="mine"
      rows={await toRows(data.pastes, locale)}
      origin={origin}
      host={host}
      collections={collections}
      actions={<ImportGistButton />}
      mobileActions={<ImportGistButton compact />}
      query={data.query}
      pagination={data.pagination}
      languageOptions={data.languageOptions}
    />
  )
}
