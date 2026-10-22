import { Button } from "@sniptide/ui/components/button"
import { getTranslations } from "next-intl/server"
import { AuthScreen } from "@/components/auth/auth-screen"
import { authSubmitClass } from "@/components/auth/fields"
import { SignInForm } from "@/components/auth/sign-in-form"
import { getInviteOnly, getSocialProviders, isDemoMode, isSignUpClosed } from "@/lib/auth"
import { oauthErrorKey } from "@/lib/oauth-errors"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Auth")
  return { title: t("signInTitle") }
}

export default async function Page({ searchParams }: PageProps<"/sign-in">) {
  const [{ host }, t, { error, reset }] = await Promise.all([
    getSiteOrigin(),
    getTranslations("Auth"),
    searchParams,
  ])
  const errorKey = oauthErrorKey(error)
  return (
    <AuthScreen
      title={t("welcomeBack")}
      subtitle={t("signInSubtitle")}
      legal={t("signInLegal")}
      pitch={{
        title: [t("signInPitchTitle1"), t("signInPitchTitle2")],
        body: t("signInPitchBody"),
        link: `${host}/k7Qe2x`,
        note: t("expiresInDays", { days: 6 }),
      }}
    >
      {isDemoMode() ? (
        <Button
          variant="outline"
          className={authSubmitClass}
          render={<a href="/demo" />}
          nativeButton={false}
        >
          {t("continueAsGuest")}
        </Button>
      ) : null}
      <SignInForm
        socialProviders={getInviteOnly() ? null : await getSocialProviders()}
        signUpClosed={isSignUpClosed()}
        initialError={errorKey ? t(`oauthErrors.${errorKey}`) : null}
        notice={reset === "1" ? t("passwordResetDone") : null}
      />
    </AuthScreen>
  )
}
