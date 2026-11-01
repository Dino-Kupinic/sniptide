"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { cn } from "@sniptide/ui/lib/utils"
import { USERNAME_PATTERN } from "@workspace/auth/username"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { useSiteHost } from "@/components/site-host"
import { track } from "@/lib/analytics"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import { authInputClass, authSubmitClass, FormError, inlineLinkClass, SwitchPrompt } from "./fields"
import { NewPasswordField } from "./password-field"
import { EmailDivider, SocialButtons } from "./social-buttons"
import { VerificationNotice } from "./verification-notice"

type Availability = "idle" | "invalid" | "checking" | "available" | "taken"

function useUsernameAvailability(username: string) {
  const [status, setStatus] = React.useState<Availability>("idle")

  React.useEffect(() => {
    if (!username) return setStatus("idle")
    if (!USERNAME_PATTERN.test(username)) return setStatus("invalid")

    setStatus("checking")
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data } = await authClient.isUsernameAvailable({ username })
      if (!cancelled) setStatus(data?.available ? "available" : "taken")
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [username])

  return status
}

// `redirectTo` is where the new account goes next (lib/auth-redirect.ts).
export function SignUpForm({
  socialProviders,
  redirectTo = "/dashboard",
}: {
  socialProviders: SocialProvider[]
  redirectTo?: string
}) {
  const t = useTranslations("Auth")
  const host = useSiteHost()
  const router = useRouter()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [verificationEmail, setVerificationEmail] = React.useState<string | null>(null)
  const availability = useUsernameAvailability(username)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (availability === "invalid" || availability === "taken") {
      setError(t(availability === "taken" ? "errors.usernameTaken" : "errors.usernameInvalid"))
      return
    }

    const form = new FormData(event.currentTarget)
    setError(null)
    setPending(true)

    const email = String(form.get("email"))
    const result = await authClient.signUp
      .email({
        name: username,
        username,
        email,
        password,
        callbackURL: redirectTo,
      })
      .catch(() => ({ error: { status: 0, code: "NETWORK_ERROR" } }))

    if (result.error) {
      setPending(false)
      setError(
        t(
          result.error.status === 0
            ? "errors.network"
            : result.error.code === "invite_only"
              ? "errors.inviteOnly"
              : "errors.signUp",
        ),
      )
      return
    }

    if (result.data?.token === null) {
      setPending(false)
      setVerificationEmail(email)
      return
    }

    track("signed_up", { method: "email" })
    router.replace(redirectTo)
    router.refresh()
  }

  if (verificationEmail) return <VerificationNotice email={verificationEmail} />

  return (
    <>
      {socialProviders?.length ? (
        <>
          <SocialButtons
            enabled={socialProviders}
            verb="Sign up"
            callbackURL={redirectTo}
            onError={setError}
          />
          <EmailDivider />
        </>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">{t("username")}</Label>
            <div
              className={cn(
                "rounded-lg flex h-10 items-center overflow-hidden border border-input focus-within:border-2 focus-within:border-primary",
                (availability === "taken" || availability === "invalid") && "border-destructive",
              )}
            >
              <span className="flex h-full items-center border-r border-input bg-sidebar pr-2 pl-3 font-mono text-xs text-muted-foreground">
                <span className="max-lg:hidden">{host}/</span>@
              </span>
              <input
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={3}
                maxLength={30}
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase().trim())}
                aria-describedby="username-status"
                aria-invalid={availability === "taken" || availability === "invalid"}
                className="h-full w-0 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base outline-none lg:text-[13px]"
              />
            </div>
            {/* Phones show only "@" in the field, so the full address sits under it. */}
            <p className="truncate font-mono text-xs text-muted-foreground lg:hidden">
              {host}/@{username}
            </p>
            <span
              id="username-status"
              aria-live="polite"
              className={cn(
                "text-xs font-medium",
                availability === "available" && "text-link",
                (availability === "taken" || availability === "invalid") && "text-destructive",
                availability === "checking" && "text-muted-foreground",
              )}
            >
              {availability === "idle" ? null : t(`availability.${availability}`)}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("email")}</Label>
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

          <NewPasswordField
            id="password"
            label={t("password")}
            value={password}
            onChange={setPassword}
            className={authInputClass}
            labelClassName="text-sm lg:text-[13px]"
          />
        </div>

        <FormError message={error} />

        <Button type="submit" size="xl" loading={pending} className={authSubmitClass}>
          {t(pending ? "creatingAccount" : "createAccount")}
        </Button>

        <SwitchPrompt>
          {t.rich("existingAccountPrompt", {
            link: (children) => (
              <Link
                href={
                  redirectTo === "/dashboard"
                    ? "/sign-in"
                    : `/sign-in?next=${encodeURIComponent(redirectTo)}`
                }
                className={inlineLinkClass}
              >
                {children}
              </Link>
            ),
          })}
        </SwitchPrompt>
      </form>
    </>
  )
}
