import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { AGENT_CARD_COOKIE, isAgentCardHidden } from "@/components/dashboard/agent-state"
import { Dashboard } from "@/components/dashboard/dashboard"
import { listConnectedAgents } from "@/lib/agents"
import { requireSession } from "@/lib/auth"
import { shouldOnboard } from "@/lib/onboarding-server"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { getAppOrigin, getRequestOrigin, getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("dashboard")} · Sniptide` }
}

export default async function Page({ searchParams }: PageProps<"/dashboard">) {
  const [session, { origin, host }, locale, jar] = await Promise.all([
    requireSession(),
    getSiteOrigin(),
    getLocale(),
    cookies(),
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
  const [agents, appOrigin] = await Promise.all([
    listConnectedAgents(session.user.id),
    // The MCP server lives with the app, not on the share-link domain.
    getAppOrigin() || getRequestOrigin().then((request) => request.origin),
  ])
  const firstName = viewerFromUser(session.user).name.split(/[\s._-]/)[0] || "there"

  return (
    <Dashboard
      data={data}
      agents={agents}
      agentCardHidden={isAgentCardHidden(jar.get(AGENT_CARD_COOKIE)?.value)}
      firstName={firstName}
      origin={origin}
      appOrigin={appOrigin}
      host={host}
    />
  )
}
