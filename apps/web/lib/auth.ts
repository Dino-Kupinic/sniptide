import "server-only"

import { createAuth } from "@workspace/auth"
import { parseAllowlist } from "@workspace/auth/allowlist"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { RESOLVED_IP_HEADER } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { sendEmailChangeConfirmation, sendEmailVerification, sendPasswordReset } from "@/lib/mail"
import { readPreferences } from "@/lib/preference-store"
import { defaultPreferences } from "@/lib/preferences"

export type SocialProvider = "github" | "google"

let auth: ReturnType<typeof createAuth> | undefined

// One auth instance per server process, built on first use so `next build` doesn't need the
// secret. Async to keep call sites unchanged from the per-request Workers version.
export async function getAuth() {
  const config = getConfig()
  if (!config.authSecret) throw new Error("BETTER_AUTH_SECRET is not set")

  const smtp = config.smtp
  auth ??= createAuth({
    db: getDb(),
    secret: config.authSecret,
    baseURL: config.appUrl,
    trustedOrigins: config.trustedOrigins,
    cookieDomain: config.cookieDomain,
    cookiePrefix: config.cookiePrefix,
    allowSignUp: config.allowSignUp,
    allowedEmails: config.allowedEmails,
    demo: config.demoMode,
    ipAddressHeaders: [RESOLVED_IP_HEADER],
    github: config.github,
    google: config.google,
    plugins: [nextCookies()],
    emailVerification: smtp ? { sendVerificationEmail: sendEmailVerification } : undefined,
    sendResetPassword: smtp ? sendPasswordReset : undefined,
    sendChangeEmailConfirmation: smtp ? sendEmailChangeConfirmation : undefined,
    // GitHub and Google failures show on the sign-in page instead of Better Auth's error page.
    errorURL: "/sign-in",
  })
  return auth
}

export async function getSocialProviders(): Promise<SocialProvider[]> {
  const configured = getConfig()

  return (["github", "google"] as const).filter((provider) => configured[provider])
}

// True when SMTP is configured, which password reset and verified email changes depend on.
export function isEmailAvailable() {
  return Boolean(getConfig().smtp)
}

// True while ALLOW_SIGN_UP=false: nobody can create an account; existing accounts sign in as usual.
export function isSignUpClosed() {
  return !getConfig().allowSignUp
}

// True on a public demo instance (DEMO_MODE=true): visitors are signed in to a shared guest account
// with example data (lib/demo).
export function isDemoMode() {
  return getConfig().demoMode
}

// True while ALLOWED_EMAILS limits sign-up to invited addresses. The sign-up page says so; the
// server refuses every other email, by password or by GitHub and Google alike.
export function isInviteOnly() {
  return Boolean(parseAllowlist(getConfig().allowedEmails))
}

export const getSession = cache(async () => {
  const requestHeaders = await headers()
  const auth = await getAuth()

  return auth.api.getSession({ headers: requestHeaders })
})

// For pages behind sign-in: returns the session or sends the visitor to /sign-in.
export async function requireSession() {
  const session = await getSession()
  // On a demo instance anyone without a session becomes the guest instead of seeing sign-in.
  if (!session) redirect(isDemoMode() ? "/demo" : "/sign-in")

  return session
}

// The signed-in user's Settings preferences, or the defaults for visitors.
export async function getPreferences() {
  const session = await getSession()
  return session ? readPreferences(session.user.id) : defaultPreferences
}
