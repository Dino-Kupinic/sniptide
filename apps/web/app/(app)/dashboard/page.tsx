import { getLocale, getTranslations } from "next-intl/server"
import { Dashboard } from "@/components/dashboard/dashboard"
import { requireSession } from "@/lib/auth"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { parsePreferences } from "@/lib/preferences-schema"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("dashboard")} · Sniptide` }
}

export default async function Page() {
  const locale = await getLocale()
  const [session, data, { origin, host }] = await Promise.all([
    requireSession(),
    getDashboardData(locale),
    getSiteOrigin(),
  ])
  const firstName = viewerFromUser(session.user).name.split(/[\s._-]/)[0] || "there"

  const preferences = parsePreferences(session.user.preferences)

  return (
    <Dashboard
      draftScope={session.user.id}
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
