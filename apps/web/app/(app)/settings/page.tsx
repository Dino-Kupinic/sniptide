import { type SettingsTab, SettingsView } from "@/components/settings/settings-view"
import { requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { storageUsage } from "@/lib/pastes/budget"
import { trashTotals } from "@/lib/pastes/lists"
import { navCounts } from "@/lib/pastes/store"
import { parsePreferences } from "@/lib/preferences-schema"
import { viewerFromUser } from "@/lib/viewer"

export const metadata = { title: "Settings · Sniptide" }

const tabs: SettingsTab[] = ["general", "defaults", "api", "billing"]

export default async function Page({ searchParams }: PageProps<"/settings">) {
  const [session, counts, trash, collections, storage, { tab }] = await Promise.all([
    requireSession(),
    navCounts(),
    trashTotals(),
    listCollections(),
    storageUsage(),
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
      storage={{
        usedMb: Math.round((storage.bytes / 1024 / 1024) * 10) / 10,
        limitMb: storage.limit.bytes / 1024 / 1024,
      }}
    />
  )
}
