import { cookies } from "next/headers"
import { AppShell } from "@/components/shell/app-shell"
import { ResourceLinksProvider } from "@/components/shell/resource-links"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { SiteHostProvider } from "@/components/site-host"
import { isDemoMode, requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
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
      <ResourceLinksProvider links={getConfig().resourceLinks}>
        <AppShell
          demo={isDemoMode()}
          viewer={viewerFromUser(session.user)}
          data={data}
          collections={collections}
          initialSidebar={parseSidebarState(cookieStore.get(SIDEBAR_COOKIE)?.value)}
        >
          {children}
        </AppShell>
      </ResourceLinksProvider>
    </SiteHostProvider>
  )
}
