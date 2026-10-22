import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { type SettingsTab, SettingsView } from "@/components/settings/settings-view"
import { readAccountSecurity } from "@/lib/account/store"
import { listTokens } from "@/lib/api/tokens"
import { getSocialProviders, isDemoMode, requireSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { listGroups } from "@/lib/env/store"
import { oauthErrorKey } from "@/lib/oauth-errors"
import { storageUsage } from "@/lib/pastes/budget"
import { trashTotals } from "@/lib/pastes/lists"
import { navCounts } from "@/lib/pastes/store"
import { readPreferences } from "@/lib/preference-store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("settings")} · Sniptide` }
}

const tabs: SettingsTab[] = ["general", "account", "defaults", "notifications", "api", "billing"]

export default async function Page({ searchParams }: PageProps<"/settings">) {
  const [session, counts, trash, collections, storage, { tab, error }] = await Promise.all([
    requireSession(),
    navCounts(),
    trashTotals(),
    listCollections(),
    storageUsage(),
    searchParams,
  ])
  const viewer = viewerFromUser(session.user)
  const [tokens, envGroups, site, security, providers, authT] = await Promise.all([
    listTokens(session.user.id),
    listGroups(session.user.id),
    getSiteOrigin(),
    readAccountSecurity(session.user.id, session.session.id),
    getSocialProviders(),
    getTranslations("Auth"),
  ])
  // Connecting GitHub or Google comes back here with ?error=<code> when it fails.
  const linkError = oauthErrorKey(error)

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
      security={{
        ...security,
        providers,
        linkError: linkError ? authT(`oauthErrors.${linkError}`) : null,
        demo: isDemoMode(),
      }}
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
