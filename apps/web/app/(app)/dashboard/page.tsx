import { getLocale, getTranslations } from "next-intl/server"
import { Dashboard } from "@/components/dashboard/dashboard"
import { getPreferences, requireSession } from "@/lib/auth"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("dashboard")} · Sniptide` }
}

export default async function Page() {
  const locale = await getLocale()
  const data = getDashboardData(locale)
  const [session, { origin, host }, preferences] = await Promise.all([
    requireSession(),
    getSiteOrigin(),
    getPreferences(),
  ])
  const firstName = viewerFromUser(session.user).name.split(/[\s._-]/)[0] || "there"

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
