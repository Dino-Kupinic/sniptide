import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { SecretEditor } from "@/components/secrets/secret-editor"
import { getSession } from "@/lib/auth"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Secrets")
  return { title: `${t("new_metadata")} · Sniptide`, robots: { index: false, follow: false } }
}
export default async function Page() {
  const t = await getTranslations("Secrets")
  if (!(await getSession())) redirect("/sign-in")
  return (
    <main className="ph-no-capture mx-auto w-full max-w-5xl space-y-7 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("new_group")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("new_description")}</p>
      </div>
      <SecretEditor />
    </main>
  )
}
