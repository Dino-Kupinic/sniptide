import { getTranslations } from "next-intl/server"
import { AuthScreen } from "@/components/auth/auth-screen"
import { RequestAccess } from "@/components/auth/request-access"
import { SignUpClosed } from "@/components/auth/sign-up-closed"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { getInviteOnly, getSocialProviders, isSignUpClosed } from "@/lib/auth"
import { accountBudget } from "@/lib/pastes/budget"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Auth")
  return { title: t("signUpTitle"), description: t("signUpDescription") }
}

export default async function Page({ searchParams }: PageProps<"/sign-up">) {
  const [{ host }, t] = await Promise.all([getSiteOrigin(), getTranslations("Auth")])
  const inviteOnly = getInviteOnly()
  const legal = t("signUpLegal")

  // ALLOW_SIGN_UP=false: no accounts can be created, not even with ?invite.
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

  // Invite-only: visitors get the request-access screen; ?invite opens the form for invitees.
  if (inviteOnly && !("invite" in (await searchParams))) {
    return (
      <AuthScreen
        subtitle={t("inviteOnlySubtitle")}
        legal={legal}
        centered
        pitch={{
          title: [t("invitePitchTitle1"), t("invitePitchTitle2")],
          body: t("invitePitchBody"),
          link: `${host}/@you`,
          note: t("profileAfterJoining"),
        }}
      >
        <RequestAccess applyUrl={inviteOnly.applyUrl} />
      </AuthScreen>
    )
  }

  // A self-hosted server can turn the storage limit off, which leaves no figure to quote.
  const limitBytes = accountBudget().bytes
  return (
    <AuthScreen
      title={t("createAccount")}
      subtitle={
        limitBytes === null
          ? t("signUpSubtitleNoLimit")
          : t("signUpSubtitle", { limit: limitBytes / 1024 / 1024 })
      }
      legal={legal}
      pitch={{
        title: [t("signUpPitchTitle1"), t("signUpPitchTitle2")],
        body: t("signUpPitchBody"),
        link: `${host}/@you`,
        note: t("publicProfile"),
      }}
    >
      <SignUpForm socialProviders={inviteOnly ? null : await getSocialProviders()} />
    </AuthScreen>
  )
}
