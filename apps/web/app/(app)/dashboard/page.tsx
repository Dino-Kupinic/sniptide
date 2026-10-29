import { getLocale, getTranslations } from "next-intl/server"
import { Dashboard } from "@/components/dashboard/dashboard"
import { getPreferences, isDemoMode, requireSession } from "@/lib/auth"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { shouldAskSignupSource } from "@/lib/signup-source-prompt"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("dashboard")} · Sniptide` }
}

export default async function Page() {
  const locale = await getLocale()
  const [session, data, { origin, host }, preferences] = await Promise.all([
    requireSession(),
    getDashboardData(locale),
    getSiteOrigin(),
    getPreferences(),
  ])
  // The shared demo account is used by many visitors, so it never asks.
  const askSignupSource = !isDemoMode() && (await shouldAskSignupSource(session.user))
  const firstName = viewerFromUser(session.user).name.split(/[\s._-]/)[0] || "there"

  return (
    <Dashboard
      draftScope={session.user.id}
      askSignupSource={askSignupSource}
      data={data}
      firstName={firstName}
      origin={origin}
      host={host}
      defaults={{
        expiry: preferences.defaultExpiry,
        visibility: preferences.defaultVisibility,
        burnAfterRead: preferences.defaultBurnAfterRead,
      }}
    />
  )
}
