import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { PasteExpiryClock } from "@/components/paste/expiry-status"
import { AppShell } from "@/components/shell/app-shell"
import { GuestShell } from "@/components/shell/guest-shell"
import { ResourceLinksProvider } from "@/components/shell/resource-links"
import { parseSidebarState, SIDEBAR_COOKIE } from "@/components/shell/sidebar-state"
import { SupportProvider } from "@/components/shell/support"
import { SiteHostProvider } from "@/components/site-host"
import { getSession, isDemoMode } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { shouldStartTour } from "@/lib/onboarding-server"
import { trashTotals } from "@/lib/pastes/lists"
import { sidebarData } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"
import { supportSettings } from "@/lib/support/server"
import { viewerFromUser } from "@/lib/viewer"

// Signed-in visitors get the app shell. A visitor without a session can only reach the editor at
// /new, which renders in the guest shell; the other pages sit in (private), whose layout sends them
// to sign-in.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, jar, { host, origin }] = await Promise.all([
    getSession(),
    cookies(),
    getSiteOrigin(),
  ])
  if (!session) {
    // On a demo instance anyone without a session becomes the guest instead.
    if (isDemoMode()) redirect("/demo")
    return (
      <SiteHostProvider host={host} origin={origin}>
        <GuestShell>{children}</GuestShell>
      </SiteHostProvider>
    )
  }
  // The sidebar cookie also holds each section's filter, which picks what sidebarData lists.
  const sidebar = parseSidebarState(jar.get(SIDEBAR_COOKIE)?.value)
  // Not awaited: the shell's frame goes out with the session alone, and its lists and counts
  // stream in behind it.
  const data = Promise.all([sidebarData(sidebar.views), listCollections(), trashTotals()]).then(
    ([sidebar, collections, trash]) => ({ sidebar, collections, trashCount: trash.count }),
  )

  return (
    <SiteHostProvider host={host} origin={origin}>
      <ResourceLinksProvider links={getConfig().resourceLinks}>
        <PasteExpiryClock>
          <SupportProvider settings={supportSettings(session.user.id)}>
            <AppShell
              demo={isDemoMode()}
              tour={await shouldStartTour(session.user)}
              viewer={viewerFromUser(session.user)}
              data={data}
              initialSidebar={sidebar}
            >
              {children}
            </AppShell>
          </SupportProvider>
        </PasteExpiryClock>
      </ResourceLinksProvider>
    </SiteHostProvider>
  )
}
