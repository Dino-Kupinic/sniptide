import { cookies } from "next/headers"
import { getLocale, getTranslations } from "next-intl/server"
import { CollectionsView } from "@/components/collections/collections-view"
import { orderCollections } from "@/components/collections/order"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { listCollections } from "@/lib/collections/store"
import { timeAgo } from "@/lib/format"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("collections")} · Sniptide` }
}

// Listed in the sidebar's order, so phones see and reorder the same list.
export default async function Page() {
  const [collections, cookieStore, locale] = await Promise.all([
    listCollections(),
    cookies(),
    getLocale(),
  ])
  const sidebar = parseSidebarState(cookieStore.get(SIDEBAR_COOKIE)?.value)
  const now = Date.now()
  const updatedLabels = Object.fromEntries(
    collections.flatMap((item) =>
      item.updatedAt === null ? [] : [[item.slug, timeAgo(item.updatedAt, now, locale)]],
    ),
  )
  return (
    <CollectionsView
      collections={orderCollections(collections, sidebar)}
      updatedLabels={updatedLabels}
    />
  )
}
