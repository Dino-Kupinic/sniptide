import { type SettingsTab, SettingsView } from "@/components/settings/settings-view"
import { requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { viewerStorage } from "@/lib/mock-data"
import { trashTotals } from "@/lib/pastes/lists"
import { navCounts } from "@/lib/pastes/store"
import { parsePreferences } from "@/lib/preferences-schema"
import { viewerFromUser } from "@/lib/viewer"

export const metadata = { title: "Settings · Sniptide" }

const tabs: SettingsTab[] = ["general", "defaults", "api", "billing"]

export default async function Page({ searchParams }: PageProps<"/settings">) {
  const [session, counts, trash, collections, { tab }] = await Promise.all([
    requireSession(),
    navCounts(),
    trashTotals(),
    listCollections(),
    searchParams,
  ])
  const viewer = viewerFromUser(session.user)

  return (
    <SettingsView
      initialTab={tabs.find((candidate) => candidate === tab) ?? "general"}
      profile={{
        name: session.user.name,
        username: session.user.username ?? "",
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
        initials: viewer.initials,
      }}
      preferences={parsePreferences(session.user.preferences)}
      counts={{
        shared: counts.shared,
        collections: collections.length,
        trash: trash.count,
        pastes: counts.pastes,
      }}
      storage={{ usedMb: viewerStorage.storageUsedMb, limitMb: viewerStorage.storageLimitMb }}
    />
  )
}
