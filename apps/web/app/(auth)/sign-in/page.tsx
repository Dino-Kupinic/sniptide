import { AuthScreen } from "@/components/auth/auth-screen"
import { SignInForm } from "@/components/auth/sign-in-form"
import { getSocialProviders } from "@/lib/auth"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Sign in · Sniptide" }

export default async function Page() {
  const { host } = await getSiteOrigin()
  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to get to your pastes."
      legal="By continuing you agree to the Terms and Privacy Policy."
      pitch={{
        title: ["Short links", "for your code."],
        body: "Paste code, choose when it expires, and share the link. Every paste shows how often it was opened.",
        link: `${host}/k7Qe2x`,
        note: "expires in 6 days",
      }}
    >
      <SignInForm socialProviders={await getSocialProviders()} />
    </AuthScreen>
  )
}
