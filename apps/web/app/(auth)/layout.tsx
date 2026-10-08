import { redirect } from "next/navigation"
import { SiteHostProvider } from "@/components/site-host"
import { getSession } from "@/lib/auth"
import { getSiteOrigin } from "@/lib/site"

// Signed-in visitors have nothing to do on the auth screens.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/dashboard")

  const { host } = await getSiteOrigin()
  return <SiteHostProvider host={host}>{children}</SiteHostProvider>
}
