import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { SettingsView } from "@/components/settings/settings-view"
import { UsageSection, UsageSectionSkeleton } from "@/components/settings/usage-section"
import { readAccountSecurity } from "@/lib/account/store"
import { getAccountTotals } from "@/lib/account/usage"
import { listTokens } from "@/lib/api/tokens"
import { getSocialProviders, isDemoMode, requireSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { listGroups } from "@/lib/env/store"
import { oauthErrorKey } from "@/lib/oauth-errors"
import { accountBudget } from "@/lib/pastes/budget"
import { navCounts } from "@/lib/pastes/store"
import { readPreferences } from "@/lib/preference-store"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("settings")} · Sniptide` }
}

export default async function Page({ searchParams }: PageProps<"/settings">) {
  const [session, counts, { error }] = await Promise.all([
    requireSession(),
    navCounts(),
    searchParams,
  ])
  const viewer = viewerFromUser(session.user)
  const [tokens, envGroups, site, security, providers, authT, totals, [account], preferences] =
    await Promise.all([
      listTokens(session.user.id),
      listGroups(session.user.id),
      getSiteOrigin(),
      readAccountSecurity(session.user.id, session.session.id),
      getSocialProviders(),
      getTranslations("Auth"),
      // The phone settings list shows a storage meter from the same counter the Usage tab reads.
      getAccountTotals(session.user.id).catch((cause: unknown) => {
        console.error("Unable to read account usage", cause)
        return null
      }),
      getDb()
        .select({ email: user.email, emailVerified: user.emailVerified })
        .from(user)
        .where(eq(user.id, session.user.id)),
      readPreferences(session.user.id),
    ])
  // Connecting GitHub or Google comes back here with ?error=<code> when it fails.
  const linkError = oauthErrorKey(error)

  return (
    <SettingsView
      usage={
        <Suspense fallback={<UsageSectionSkeleton />}>
          <UsageSection ownerId={session.user.id} />
        </Suspense>
      }
      profile={{
        name: session.user.name,
        username: session.user.username ?? "",
        email: account?.email ?? session.user.email,
        emailVerified: account?.emailVerified ?? false,
        image: session.user.image ?? null,
        initials: viewer.initials,
      }}
      preferences={preferences}
      emailAvailable={Boolean(getConfig().smtp)}
      security={{
        ...security,
        providers,
        linkError: linkError ? authT(`oauthErrors.${linkError}`) : null,
        demo: isDemoMode(),
      }}
      pasteCount={counts.pastes}
      api={{ tokens, envGroups, origin: getConfig().appUrl ?? site.origin }}
      storage={totals && { used: totals.storageBytes, limit: accountBudget().bytes }}
    />
  )
}
