import { cookies } from "next/headers"
import { getTranslations } from "next-intl/server"
import { CollectionsView } from "@/components/collections/collections-view"
import { orderCollections } from "@/components/collections/order"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { listCollections } from "@/lib/collections/store"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("collections")} · Sniptide` }
}

// Listed in the sidebar's order, so phones see and reorder the same list.
export default async function Page() {
  const [collections, cookieStore] = await Promise.all([listCollections(), cookies()])
  const sidebar = parseSidebarState(cookieStore.get(SIDEBAR_COOKIE)?.value)
  return <CollectionsView collections={orderCollections(collections, sidebar)} />
}
