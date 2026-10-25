import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { PublicHeader } from "@/components/public-header"
import { SharedSecret } from "@/components/secrets/shared-secret"
import { getSession } from "@/lib/auth"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Secrets")
  return {
    title: `${t("protected_title")} · Sniptide`,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  }
}
export const dynamic = "force-dynamic"
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader signedIn={Boolean(await getSession())} />
      <SharedSecret token={token} />
    </div>
  )
}
