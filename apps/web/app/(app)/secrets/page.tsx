import { redirect } from "next/navigation"
import { SecretList } from "@/components/secrets/secret-list"
import { getSession } from "@/lib/auth"
import { listSecrets } from "@/lib/env/web-store"

export const metadata = { title: "Secrets · Sniptide", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"
export default async function Page() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  return <SecretList groups={await listSecrets(session.user.id)} />
}
