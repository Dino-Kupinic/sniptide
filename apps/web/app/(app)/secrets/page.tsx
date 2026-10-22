import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { SecretList } from "@/components/secrets/secret-list"
import { getSession } from "@/lib/auth"
import { listSecrets } from "@/lib/env/web-store"
import { timeAgo } from "@/lib/format"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Secrets")
  return { title: `${t("title")} · Sniptide`, robots: { index: false, follow: false } }
}
export const dynamic = "force-dynamic"
export default async function Page() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  const [groups, locale] = await Promise.all([listSecrets(session.user.id), getLocale()])
  const now = Date.now()
  return (
    <SecretList
      groups={groups.map((group) => ({ ...group, updated: timeAgo(group.updatedAt, now, locale) }))}
    />
  )
}
