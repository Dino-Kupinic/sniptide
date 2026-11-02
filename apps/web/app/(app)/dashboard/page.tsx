import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { Dashboard } from "@/components/dashboard/dashboard"
import { getPreferences, requireSession } from "@/lib/auth"
import { shouldOnboard } from "@/lib/onboarding-server"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("dashboard")} · Sniptide` }
}

export default async function Page({ searchParams }: PageProps<"/dashboard">) {
  const locale = await getLocale()
  const [session, { origin, host }, preferences] = await Promise.all([
    requireSession(),
    getSiteOrigin(),
    getPreferences(),
  ])
  // Every sign-up lands here, by email, social sign-in or a verification link, so this is where a
  // new account turns off to the welcome wizard. The social sign-up marker (?auth=) goes along so
  // the signed_up event still fires.
  if (await shouldOnboard(session.user)) {
    const { auth, method } = await searchParams
    const marker =
      typeof auth === "string" && typeof method === "string"
        ? `?${new URLSearchParams({ auth, method })}`
        : ""
    redirect(`/welcome${marker}`)
  }
  const data = getDashboardData(locale)
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
