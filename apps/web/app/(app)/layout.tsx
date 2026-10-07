import { AppShell } from "@/components/shell/app-shell"
import { collections, navCounts, viewer } from "@/lib/mock-data"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell viewer={viewer} counts={navCounts} collections={collections}>
      {children}
    </AppShell>
  )
}
