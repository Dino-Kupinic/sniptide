import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { type SettingsTab, SettingsView } from "@/components/settings/settings-view"
import { listTokens } from "@/lib/api/tokens"
import { requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { listGroups } from "@/lib/env/store"
import { storageUsage } from "@/lib/pastes/budget"
import { trashTotals } from "@/lib/pastes/lists"
import { navCounts } from "@/lib/pastes/store"
import { readPreferences } from "@/lib/preference-store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export const metadata = { title: "Settings · Sniptide" }

const tabs: SettingsTab[] = ["general", "defaults", "notifications", "api", "billing"]

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
  const [tokens, envGroups, site] = await Promise.all([
    listTokens(session.user.id),
    listGroups(session.user.id),
    getSiteOrigin(),
  ])

  const [account] = await getDb()
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, session.user.id))

  return (
    <SettingsView
      initialTab={tabs.find((candidate) => candidate === tab) ?? "general"}
      profile={{
        name: session.user.name,
        username: session.user.username ?? "",
        email: account?.email ?? session.user.email,
        emailVerified: account?.emailVerified ?? false,
        image: session.user.image ?? null,
        initials: viewer.initials,
      }}
      preferences={await readPreferences(session.user.id)}
      emailAvailable={Boolean(getConfig().smtp)}
      counts={{
        shared: counts.shared,
        collections: collections.length,
        trash: trash.count,
        pastes: counts.pastes,
      }}
      api={{ tokens, envGroups, origin: getConfig().appUrl ?? site.origin }}
      storage={{
        usedMb: Math.round((storage.bytes / 1024 / 1024) * 10) / 10,
        limitMb: storage.limit.bytes / 1024 / 1024,
      }}
    />
  )
}
