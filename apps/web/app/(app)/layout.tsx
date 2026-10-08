import { AppShell } from "@/components/shell/app-shell"
import { requireSession } from "@/lib/auth"
import { collections, navCounts } from "@/lib/mock-data"
import { viewerFromUser } from "@/lib/viewer"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <AppShell viewer={viewerFromUser(session.user)} counts={navCounts} collections={collections}>
      {children}
    </AppShell>
  )
}
