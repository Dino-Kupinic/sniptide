import { AuthScreen } from "@/components/auth/auth-screen"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { getSocialProviders } from "@/lib/auth"

export const metadata = { title: "Create account · Sniptide" }

export default async function Page() {
  return (
    <AuthScreen
      title="Create account"
      subtitle="Free for up to 100 MB of pastes."
      legal="By creating an account you agree to the Terms and Privacy Policy."
      pitch={{
        title: ["A profile for", "your public pastes."],
        body: "Public pastes are listed on your profile. Private and unlisted pastes are only visible through their link.",
        link: "sniptide.com/@you",
        note: "your public profile",
      }}
    >
      <SignUpForm socialProviders={await getSocialProviders()} />
    </AuthScreen>
  )
}
