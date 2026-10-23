import { cookies } from "next/headers"
import { AppShell } from "@/components/shell/app-shell"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { SiteHostProvider } from "@/components/site-host"
import { isDemoMode, requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { sidebarData } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The sidebar cookie also holds each section's filter, which picks what sidebarData lists.
  const sidebar = parseSidebarState((await cookies()).get(SIDEBAR_COOKIE)?.value)
  const [session, data, { host }, collections] = await Promise.all([
    requireSession(),
    sidebarData(sidebar.views),
    getSiteOrigin(),
    listCollections(),
  ])

  return (
    <SiteHostProvider host={host}>
      <AppShell
        demo={isDemoMode()}
        viewer={viewerFromUser(session.user)}
        data={data}
        collections={collections}
        initialSidebar={sidebar}
      >
        {children}
      </AppShell>
    </SiteHostProvider>
  )
}
