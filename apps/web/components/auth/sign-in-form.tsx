"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import { authInputClass, authSubmitClass, FormError, inlineLinkClass, SwitchPrompt } from "./fields"
import { EmailDivider, SocialButtons } from "./social-buttons"

export function SignInForm({ socialProviders }: { socialProviders: SocialProvider[] }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [showResetNote, setShowResetNote] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setPending(true)

    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })

    if (error) {
      setPending(false)
      setError(
        error.status === 401
          ? "That email and password don't match an account."
          : (error.message ?? "Couldn't sign you in. Try again."),
      )
      return
    }

    router.replace("/dashboard")
    router.refresh()
  }

  return (
    <>
      <SocialButtons
        enabled={socialProviders}
        verb="Continue"
        callbackURL="/dashboard"
        onError={setError}
      />
      <EmailDivider />

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
                Password reset by email isn't available yet. Sign in with GitHub or Google if you
                linked one.
              </p>
            ) : null}
          </div>
        </div>

        <FormError message={error} />

        <Button type="submit" disabled={pending} className={authSubmitClass}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        <SwitchPrompt>
          New to Sniptide?{" "}
          <Link href="/sign-up" className={inlineLinkClass}>
            Create an account
          </Link>
        </SwitchPrompt>
      </form>
    </>
  )
}
