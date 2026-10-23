"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { authInputClass, authSubmitClass, FormError, inlineLinkClass, SwitchPrompt } from "./fields"

export function BackToSignIn() {
  const t = useTranslations("Auth")
  return (
    <SwitchPrompt>
      {t.rich("backToSignInPrompt", {
        link: (children) => (
          <Link href="/sign-in" className={inlineLinkClass}>
            {children}
          </Link>
        ),
      })}
    </SwitchPrompt>
  )
}

// The answer is the same whether or not an account uses the address, so the form can't be used
// to find out who has an account.
export function ForgotPasswordForm() {
  const t = useTranslations("Auth")
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get("email")).trim()
    setError(null)
    setPending(true)
    const { error } = await authClient
      .requestPasswordReset({ email, redirectTo: "/reset-password" })
      .catch(() => ({ error: { status: 0 } }))
    setPending(false)
    if (error) {
      setError(
        t(
          error.status === 429
            ? "errors.tooManyAttempts"
            : error.status === 0
              ? "errors.network"
              : "errors.resetRequest",
        ),
      )
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5 lg:gap-6">
        <p role="status" className="text-[15px] leading-6 lg:text-sm lg:leading-5">
          {t("resetLinkSent", { email: sentTo })}
        </p>
        <Button variant="outline" className={authSubmitClass} onClick={() => setSentTo(null)}>
          {t("useAnotherEmail")}
        </Button>
        <BackToSignIn />
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 lg:gap-6">
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
          autoFocus
          className={authInputClass}
        />
      </div>

      <FormError message={error} />

      <Button type="submit" loading={pending} className={authSubmitClass}>
        {t(pending ? "sendingResetLink" : "sendResetLink")}
      </Button>

      <BackToSignIn />
    </form>
  )
}

// Without SMTP there's no way to prove who owns an address, so reset goes through the admin.
export function ResetUnavailable({ social }: { social: boolean }) {
  const t = useTranslations("Auth")
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <p className="text-[15px] leading-6 lg:text-sm lg:leading-5">
        {t(social ? "resetUnavailableSocial" : "resetUnavailable")}
      </p>
      <Button
        variant="outline"
        className={authSubmitClass}
        render={<Link href="/sign-in" />}
        nativeButton={false}
      >
        {t("backToSignIn")}
      </Button>
    </div>
  )
}
