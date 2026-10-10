import { cookies } from "next/headers"
import { AppShell } from "@/components/shell/app-shell"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { SiteHostProvider } from "@/components/site-host"
import { requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { sidebarData } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, data, { host }, collections, cookieStore] = await Promise.all([
    requireSession(),
    sidebarData(),
    getSiteOrigin(),
    listCollections(),
    cookies(),
  ])

  return (
    <SiteHostProvider host={host}>
      <AppShell
        viewer={viewerFromUser(session.user)}
        data={data}
        collections={collections}
        initialSidebar={parseSidebarState(cookieStore.get(SIDEBAR_COOKIE)?.value)}
      >
        {children}
      </AppShell>
    </SiteHostProvider>
  )
}
