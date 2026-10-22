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
    <div className="ph-no-capture mx-auto flex w-full max-w-5xl flex-col gap-7 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:p-7">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em]">
          {t("new_group")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("new_description")}</p>
      </div>
      <SecretEditor />
    </div>
  )
}
