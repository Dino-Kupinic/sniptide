import { AuthScreen } from "@/components/auth/auth-screen"
import { RequestAccess } from "@/components/auth/request-access"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { getInviteOnly, getSocialProviders } from "@/lib/auth"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Create account · Sniptide" }

export default async function Page({ searchParams }: PageProps<"/sign-up">) {
  const { host } = await getSiteOrigin()
  const inviteOnly = getInviteOnly()
  const legal = "By creating an account you agree to the Terms and Privacy Policy."

  // Invite-only: visitors get the request-access screen; ?invite opens the form for invitees.
  if (inviteOnly && !("invite" in (await searchParams))) {
    return (
      <AuthScreen
        subtitle="Sniptide is invite-only while it's in early access. Apply and we'll send you an invite."
        legal={legal}
        centered
        pitch={{
          title: ["Early access,", "by invite."],
          body: "Sniptide is still changing fast, so we're letting people in a few at a time. Apply and we'll add your email.",
          link: `${host}/@you`,
          note: "yours once you're in",
        }}
      >
        <RequestAccess applyUrl={inviteOnly.applyUrl} />
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title="Create account"
      subtitle="Free for up to 100 MB of pastes."
      legal={legal}
      pitch={{
        title: ["A profile for", "your public pastes."],
        body: "Public pastes are listed on your profile. Private and unlisted pastes are only visible through their link.",
        link: `${host}/@you`,
        note: "your public profile",
      }}
    >
      <SignUpForm socialProviders={inviteOnly ? null : await getSocialProviders()} />
    </AuthScreen>
  )
}
