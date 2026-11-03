import { getTranslations } from "next-intl/server"
import { AuthScreen } from "@/components/auth/auth-screen"
import { LegalNotice } from "@/components/auth/legal-notice"
import { ResetLinkExpired, ResetPasswordForm } from "@/components/auth/reset-password-form"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Auth")
  return { title: t("resetPasswordTitle") }
}

// The link in the reset email goes through /api/auth/reset-password/<token>, which lands here
// with ?token=<token>, or with ?error=INVALID_TOKEN once the link has expired or was used.
export default async function Page({ searchParams }: PageProps<"/reset-password">) {
  const [{ host }, t, { token }] = await Promise.all([
    getSiteOrigin(),
    getTranslations("Auth"),
    searchParams,
  ])
  const valid = typeof token === "string" && token.length > 0
  return (
    <AuthScreen
      title={t("chooseNewPassword")}
      subtitle={t("chooseNewPasswordSubtitle")}
      legal={<LegalNotice action="continue" />}
      pitch={{
        title: [t("signInPitchTitle1"), t("signInPitchTitle2")],
        body: t("signInPitchBody"),
        link: `${host}/k7Qe2x`,
        note: t("expiresInDays", { days: 6 }),
      }}
    >
      {valid ? <ResetPasswordForm token={token} /> : <ResetLinkExpired />}
    </AuthScreen>
  )
}
