"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { track } from "@/lib/analytics"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import { authInputClass, authSubmitClass, FormError, inlineLinkClass, SwitchPrompt } from "./fields"
import { EmailDivider, SocialButtons } from "./social-buttons"

// `socialProviders` is null while sign-up is invite-only, which hides GitHub and Google and points
// newcomers to the request-access page.
// `signUpClosed` hides the link to the sign-up page (ALLOW_SIGN_UP=false).
export function SignInForm({
  socialProviders,
  signUpClosed = false,
}: {
  socialProviders: SocialProvider[] | null
  signUpClosed?: boolean
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [showResetNote, setShowResetNote] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setPending(true)

    const { error } = await authClient.signIn
      .email({
        email: String(form.get("email")),
        password: String(form.get("password")),
      })
      .catch(() => ({ error: { status: 0, message: "Couldn't reach the server. Try again." } }))

    if (error) {
      setPending(false)
      setError(
        error.status === 401
          ? "That email and password don't match an account."
          : (error.message ?? "Couldn't sign you in. Try again."),
      )
      return
    }

    track("signed_in", { method: "email" })
    router.replace("/dashboard")
    router.refresh()
  }

  return (
    <>
      {socialProviders ? (
        <>
          <SocialButtons
            enabled={socialProviders}
            verb="Continue"
            callbackURL="/dashboard"
            onError={setError}
          />
          <EmailDivider />
        </>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-5 lg:gap-6">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-sm lg:text-[13px]">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              className={authInputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm lg:text-[13px]">
                Password
              </Label>
              <button
                type="button"
                onClick={() => setShowResetNote((value) => !value)}
                aria-expanded={showResetNote}
                className="text-sm text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 lg:text-[13px]"
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={authInputClass}
            />
            {showResetNote ? (
              <p className="text-xs text-muted-foreground">
                Password reset by email isn't available yet.
                {socialProviders ? " Sign in with GitHub or Google if you linked one." : null}
              </p>
            ) : null}
          </div>
        </div>

        <FormError message={error} />

        <Button type="submit" loading={pending} className={authSubmitClass}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        {signUpClosed ? null : (
          <SwitchPrompt>
            New to Sniptide?{" "}
            <Link href="/sign-up" className={inlineLinkClass}>
              {socialProviders ? "Create an account" : "Request access"}
            </Link>
          </SwitchPrompt>
        )}
      </form>
    </>
  )
}
