"use client"

import { USERNAME_PATTERN } from "@workspace/auth/username"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import { authInputClass, authSubmitClass, FormError, inlineLinkClass, SwitchPrompt } from "./fields"
import { passwordStrength } from "./password-strength"
import { EmailDivider, SocialButtons } from "./social-buttons"

type Availability = "idle" | "invalid" | "checking" | "available" | "taken"

const availabilityText: Record<Availability, string> = {
  idle: "",
  invalid: "3–30 of a–z, 0–9, - and _",
  checking: "Checking…",
  available: "Available",
  taken: "Taken",
}

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

export function SignUpForm({ socialProviders }: { socialProviders: SocialProvider[] }) {
  const router = useRouter()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const availability = useUsernameAvailability(username)
  const strength = passwordStrength(password)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (availability === "invalid" || availability === "taken") {
      setError(
        availability === "taken"
          ? "That username is taken. Try another one."
          : "Usernames are 3–30 lowercase letters, numbers, hyphens or underscores.",
      )
      return
    }

    const form = new FormData(event.currentTarget)
    setError(null)
    setPending(true)

    const { error } = await authClient.signUp.email({
      name: username,
      username,
      email: String(form.get("email")),
      password,
    })

    if (error) {
      setPending(false)
      setError(error.message ?? "Couldn't create your account. Try again.")
      return
    }

    router.replace("/dashboard")
    router.refresh()
  }

  return (
    <>
      <SocialButtons
        enabled={socialProviders}
        verb="Sign up"
        callbackURL="/dashboard"
        onError={setError}
      />
      <EmailDivider />

      <form onSubmit={onSubmit} className="flex flex-col gap-5 lg:gap-6">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username" className="text-sm lg:text-[13px]">
              Username
            </Label>
            <div
              className={cn(
                "flex h-[46px] items-center border border-input focus-within:border-2 focus-within:border-primary lg:h-10",
                (availability === "taken" || availability === "invalid") && "border-destructive",
              )}
            >
              <span className="flex h-full items-center border-r border-input bg-sidebar pr-2 pl-3 font-mono text-xs text-muted-foreground">
                sniptide.com/@
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
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base outline-none lg:text-[13px]"
              />
              <span
                id="username-status"
                aria-live="polite"
                className={cn(
                  "shrink-0 pr-3 text-xs font-medium",
                  availability === "available" && "text-primary",
                  (availability === "taken" || availability === "invalid") && "text-destructive",
                  availability === "checking" && "text-muted-foreground",
                )}
              >
                {availabilityText[availability]}
              </span>
            </div>
          </div>

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
            <Label htmlFor="password" className="text-sm lg:text-[13px]">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="password-strength"
              className={authInputClass}
            />
            {password ? (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1" aria-hidden="true">
                  {[1, 2, 3, 4].map((segment) => (
                    <span
                      key={segment}
                      className={cn(
                        "h-[3px] flex-1 bg-border",
                        segment <= strength.score && "bg-primary",
                      )}
                    />
                  ))}
                </div>
                <p id="password-strength" className="text-xs text-muted-foreground">
                  {strength.label}.{strength.hint ? ` ${strength.hint}.` : null}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <FormError message={error} />

        <Button type="submit" disabled={pending} className={authSubmitClass}>
          {pending ? "Creating account…" : "Create account"}
        </Button>

        <SwitchPrompt>
          Already have an account?{" "}
          <Link href="/sign-in" className={inlineLinkClass}>
            Sign in
          </Link>
        </SwitchPrompt>
      </form>
    </>
  )
}
