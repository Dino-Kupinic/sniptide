import { AppShell } from "@/components/shell/app-shell"
import { requireSession } from "@/lib/auth"
import { collections } from "@/lib/mock-data"
import { navCounts } from "@/lib/pastes/store"
import { viewerFromUser } from "@/lib/viewer"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, counts] = await Promise.all([requireSession(), navCounts()])

  return (
    <AppShell viewer={viewerFromUser(session.user)} counts={counts} collections={collections}>
      {children}
    </AppShell>
  )
}
