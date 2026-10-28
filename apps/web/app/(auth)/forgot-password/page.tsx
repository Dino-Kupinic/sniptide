import { getTranslations } from "next-intl/server"
import { AuthScreen } from "@/components/auth/auth-screen"
import { ForgotPasswordForm, ResetUnavailable } from "@/components/auth/forgot-password-form"
import { LegalNotice } from "@/components/auth/legal-notice"
import { getSocialProviders, isEmailAvailable } from "@/lib/auth"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Auth")
  return { title: t("forgotPasswordTitle") }
}

export default async function Page() {
  const [{ host }, t] = await Promise.all([getSiteOrigin(), getTranslations("Auth")])
  const available = isEmailAvailable()
  return (
    <AuthScreen
      title={t("resetYourPassword")}
      subtitle={t(available ? "forgotPasswordSubtitle" : "resetUnavailableSubtitle")}
      legal={<LegalNotice action="continue" />}
      pitch={{
        title: [t("signInPitchTitle1"), t("signInPitchTitle2")],
        body: t("signInPitchBody"),
        link: `${host}/k7Qe2x`,
        note: t("expiresInDays", { days: 6 }),
      }}
    >
      {available ? (
        <ForgotPasswordForm />
      ) : (
        <ResetUnavailable social={(await getSocialProviders()).length > 0} />
      )}
    </AuthScreen>
  )
}
