import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { SettingsView } from "@/components/settings/settings-view"
import { listTokens } from "@/lib/api/tokens"
import { requireSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { listGroups } from "@/lib/env/store"
import { storageUsage } from "@/lib/pastes/budget"
import { navCounts } from "@/lib/pastes/store"
import { readPreferences } from "@/lib/preference-store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("settings")} · Sniptide` }
}

export default async function Page() {
  const [session, counts, storage] = await Promise.all([
    requireSession(),
    navCounts(),
    storageUsage(),
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
      pasteCount={counts.pastes}
      api={{ tokens, envGroups, origin: getConfig().appUrl ?? site.origin }}
      storage={{
        usedMb: Math.round((storage.bytes / 1024 / 1024) * 10) / 10,
        limitMb: storage.limit.bytes / 1024 / 1024,
      }}
    />
  )
}
