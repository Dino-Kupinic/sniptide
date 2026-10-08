import { Dashboard } from "@/components/dashboard/dashboard"
import { requireSession } from "@/lib/auth"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { getSiteOrigin } from "@/lib/site"
import { viewerFromUser } from "@/lib/viewer"

export const metadata = { title: "Dashboard · Sniptide" }

export default async function Page() {
  const [session, data, { origin, host }] = await Promise.all([
    requireSession(),
    getDashboardData(),
    getSiteOrigin(),
  ])
  const firstName = viewerFromUser(session.user).name.split(/[\s._-]/)[0] || "there"

  return <Dashboard data={data} firstName={firstName} origin={origin} host={host} />
}
