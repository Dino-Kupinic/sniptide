"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { track } from "@/lib/analytics"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import { authInputClass, authSubmitClass, FormError, inlineLinkClass, SwitchPrompt } from "./fields"
import { EmailDivider, SocialButtons } from "./social-buttons"
import { VerificationNotice } from "./verification-notice"

// `socialProviders` is null while sign-up is invite-only, which hides GitHub and Google and points
// newcomers to the request-access page.
// `signUpClosed` hides the link to the sign-up page (ALLOW_SIGN_UP=false).
// `initialError` explains a failed GitHub or Google sign-in, `notice` confirms a password reset.
export function SignInForm({
  socialProviders,
  signUpClosed = false,
  initialError = null,
  notice = null,
}: {
  socialProviders: SocialProvider[] | null
  signUpClosed?: boolean
  initialError?: string | null
  notice?: string | null
}) {
  const t = useTranslations("Auth")
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(initialError)
  const [pending, setPending] = React.useState(false)
  const [verificationEmail, setVerificationEmail] = React.useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setVerificationEmail(null)
    setPending(true)

    const { error } = await authClient.signIn
      .email({
        email: String(form.get("email")),
        password: String(form.get("password")),
      })
      .catch(() => ({ error: { status: 0, code: "NETWORK_ERROR" } }))

    if (error) {
      setPending(false)
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setVerificationEmail(String(form.get("email")))
        return
      }
      setError(
        error.status === 401
          ? t("errors.credentials")
          : t(error.status === 0 ? "errors.network" : "errors.signIn"),
      )
      return
    }

    track("signed_in", { method: "email" })
    router.replace("/dashboard")
    router.refresh()
  }

  return (
    <>
      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-foreground"
        >
          {notice}
        </p>
      ) : null}
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
              {t("email")}
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
                {t("password")}
              </Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 lg:text-[13px]"
              >
                {t("forgotPassword")}
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={authInputClass}
            />
          </div>
        </div>

        <FormError message={error} />
        {verificationEmail ? <VerificationNotice email={verificationEmail} /> : null}

        <Button type="submit" loading={pending} className={authSubmitClass}>
          {t(pending ? "signingIn" : "signIn")}
        </Button>

        {signUpClosed ? null : (
          <SwitchPrompt>
            {t.rich(socialProviders ? "newAccountPrompt" : "requestAccessPrompt", {
              link: (children) => (
                <Link href="/sign-up" className={inlineLinkClass}>
                  {children}
                </Link>
              ),
            })}
          </SwitchPrompt>
        )}
      </form>
    </>
  )
}
