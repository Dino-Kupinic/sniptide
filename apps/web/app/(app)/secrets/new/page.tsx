import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { NewSecretGroup } from "@/components/secrets/new-secret-group"
import { getSession } from "@/lib/auth"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Secrets")
  return { title: `${t("new_metadata")} · Sniptide`, robots: { index: false, follow: false } }
}
export default async function Page() {
  if (!(await getSession())) redirect("/sign-in")
  return <NewSecretGroup />
}
