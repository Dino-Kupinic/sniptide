"use client"

import { Button } from "@sniptide/ui/components/button"
import { useTranslations } from "next-intl"
import * as React from "react"
import { track, withAuthMarker } from "@/lib/analytics"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"

export function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-foreground lg:size-4">
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
    </svg>
  )
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"
        fill="#34A853"
      />
      <path d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8z" fill="#FBBC05" />
      <path
        d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
        fill="#EA4335"
      />
    </svg>
  )
}

const providers = [
  { id: "github", name: "GitHub", icon: GitHubIcon },
  { id: "google", name: "Google", icon: GoogleIcon },
] as const

// Social sign-in buttons for the providers that have OAuth credentials on the server. The
// forms leave out the buttons and the divider when none do.
export function SocialButtons({
  enabled,
  verb,
  callbackURL,
  onError,
}: {
  enabled: SocialProvider[]
  verb: "Continue" | "Sign up"
  callbackURL: string
  onError: (message: string) => void
}) {
  const t = useTranslations("Auth")
  const [pending, setPending] = React.useState<SocialProvider | null>(null)

  async function signIn(provider: SocialProvider) {
    setPending(provider)
    // The account is created after the provider's redirect; this marks the attempt. The result
    // is reported on return: new accounts land on newUserCallbackURL, the rest on callbackURL.
    if (verb === "Sign up") track("sign_up_started", { method: provider })
    const { error } = await authClient.signIn
      .social({
        provider,
        callbackURL: withAuthMarker(callbackURL, "signed_in", provider),
        newUserCallbackURL: withAuthMarker(callbackURL, "signed_up", provider),
      })
      .catch(() => ({ error: { message: undefined } }))
    if (error) {
      setPending(null)
      onError(t("errors.provider"))
    }
  }

  return (
    <div className="flex gap-2 lg:flex-col">
      {providers
        .filter(({ id }) => enabled.includes(id))
        .map(({ id, name, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            size="xl"
            disabled={pending !== null && pending !== id}
            loading={pending === id}
            aria-label={t(verb === "Sign up" ? "socialSignUp" : "socialContinue", {
              provider: name,
            })}
            onClick={() => signIn(id)}
            className="flex-1 gap-2 lg:flex-none lg:gap-2.5"
          >
            <Icon />
            <span className="lg:hidden">{name}</span>
            <span className="hidden lg:inline">
              {t(verb === "Sign up" ? "socialSignUp" : "socialContinue", { provider: name })}
            </span>
          </Button>
        ))}
    </div>
  )
}

export function EmailDivider() {
  const t = useTranslations("Auth")
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {t("emailDivider")}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
