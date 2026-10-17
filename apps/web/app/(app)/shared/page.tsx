import { getLocale, getTranslations } from "next-intl/server"
import { SharedList } from "@/components/lists/shared-list"
import { toSharedRows } from "@/lib/pastes/rows"
import { listShared } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("shared")} · Sniptide` }
}

export default async function Page() {
  const locale = await getLocale()
  const [entries, { origin, host }] = await Promise.all([listShared(), getSiteOrigin()])
  const rows = await toSharedRows(entries, locale)

  return <SharedList rows={rows} origin={origin} host={host} />
}
