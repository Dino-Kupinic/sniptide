import { getTranslations } from "next-intl/server"
import { AuthScreen } from "@/components/auth/auth-screen"
import { LegalNotice } from "@/components/auth/legal-notice"
import { SignUpClosed } from "@/components/auth/sign-up-closed"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { getSocialProviders, isInviteOnly, isSignUpClosed } from "@/lib/auth"
import { afterSignIn } from "@/lib/auth-redirect"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Auth")
  return { title: t("signUpTitle"), description: t("signUpDescription") }
}

export default async function Page({ searchParams }: PageProps<"/sign-up">) {
  const [{ host }, t] = await Promise.all([getSiteOrigin(), getTranslations("Auth")])
  const legal = <LegalNotice action="signUp" />

  // ALLOW_SIGN_UP=false: no accounts can be created, not even for invited emails.
  if (isSignUpClosed()) {
    return (
      <AuthScreen
        subtitle={t("signUpClosedSubtitle")}
        legal={legal}
        centered
        pitch={{
          title: [t("closedPitchTitle1"), t("closedPitchTitle2")],
          body: t("closedPitchBody"),
          link: `${host}/@you`,
          note: t("profileAfterJoining"),
        }}
      >
        <SignUpClosed />
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title={t("signUpHeading")}
      // Invite-only keeps its subtitle, since it says whose email the server accepts. The same
      // form still offers GitHub and Google; the server refuses emails not on ALLOWED_EMAILS.
      subtitle={isInviteOnly() ? t("inviteOnlySubtitle") : undefined}
      legal={legal}
      pitch={{
        title: [t("signUpPitchTitle1"), t("signUpPitchTitle2")],
        body: t("signUpPitchBody"),
        link: `${host}/@you`,
        note: t("publicProfile"),
      }}
    >
      <SignUpForm
        socialProviders={await getSocialProviders()}
        redirectTo={afterSignIn((await searchParams).next)}
      />
    </AuthScreen>
  )
}
