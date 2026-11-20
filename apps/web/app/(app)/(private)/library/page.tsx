import { cookies } from "next/headers"
import { getTranslations } from "next-intl/server"
import { orderCollections } from "@/components/collections/order"
import { LibraryView } from "@/components/library/library-view"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { listCollections } from "@/lib/collections/store"
import { trashTotals } from "@/lib/pastes/lists"
import { navCounts } from "@/lib/pastes/store"

export async function generateMetadata() {
  const t = await getTranslations("Workspace")
  return { title: `${t("library")} · Sniptide` }
}

// The Library tab on phones. Collections follow the sidebar's order, like the Collections page.
export default async function Page() {
  const [counts, trash, collections, cookieStore] = await Promise.all([
    navCounts(),
    trashTotals(),
    listCollections(),
    cookies(),
  ])
  const sidebar = parseSidebarState(cookieStore.get(SIDEBAR_COOKIE)?.value)
  return (
    <LibraryView
      counts={{ starred: counts.starred, shared: counts.shared, trash: trash.count }}
      collections={orderCollections(collections, sidebar)}
    />
  )
}
