import { AppShell } from "@/components/shell/app-shell"
import { SiteHostProvider } from "@/components/site-host"
import { requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { navCounts } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, counts, { host }, collections] = await Promise.all([
    requireSession(),
    navCounts(),
    getSiteOrigin(),
    listCollections(),
  ])

  return (
    <SiteHostProvider host={host}>
      <AppShell viewer={viewerFromUser(session.user)} counts={counts} collections={collections}>
        {children}
      </AppShell>
    </SiteHostProvider>
  )
}
