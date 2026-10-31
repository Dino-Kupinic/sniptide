import { cookies } from "next/headers"
import { Suspense } from "react"
import { AppShellSkeleton } from "@/components/loading/app-shell-skeleton"
import { AppShell } from "@/components/shell/app-shell"
import { ResourceLinksProvider } from "@/components/shell/resource-links"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { SiteHostProvider } from "@/components/site-host"
import { isDemoMode, requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { trashTotals } from "@/lib/pastes/lists"
import { sidebarData } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The sidebar cookie also holds each section's filter, which picks what sidebarData lists.
  const sidebar = parseSidebarState((await cookies()).get(SIDEBAR_COOKIE)?.value)
  const session = await requireSession()
  return (
    <Suspense fallback={<AppShellSkeleton sidebar={sidebar} />}>
      <LoadedShell sidebar={sidebar} session={session}>
        {children}
      </LoadedShell>
    </Suspense>
  )
}

async function LoadedShell({
  children,
  sidebar,
  session,
}: {
  children: React.ReactNode
  sidebar: ReturnType<typeof parseSidebarState>
  session: Awaited<ReturnType<typeof requireSession>>
}) {
  const [data, { host }, collections, trash] = await Promise.all([
    sidebarData(sidebar.views),
    getSiteOrigin(),
    listCollections(),
    trashTotals(),
  ])

  return (
    <SiteHostProvider host={host}>
      <ResourceLinksProvider links={getConfig().resourceLinks}>
        <AppShell
          demo={isDemoMode()}
          viewer={viewerFromUser(session.user)}
          data={data}
          collections={collections}
          initialSidebar={sidebar}
          trashCount={trash.count}
        >
          {children}
        </AppShell>
      </ResourceLinksProvider>
    </SiteHostProvider>
  )
}
