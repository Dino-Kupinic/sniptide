import "server-only"

import { createAuth, type OAuthCredentials } from "@workspace/auth"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { RESOLVED_IP_HEADER } from "@/lib/client-ip"
import { getDb } from "@/lib/db"
import { parsePreferences } from "@/lib/preferences-schema"

export type SocialProvider = "github" | "google"

function credentials(clientId?: string, clientSecret?: string): OAuthCredentials | undefined {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

// OAuth apps are optional: set both halves (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, …) in
// .env.local or in Coolify to turn a provider on.
function getOAuthCredentials() {
  return {
    github: credentials(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET),
    google: credentials(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
  }
}

let auth: ReturnType<typeof createAuth> | undefined

// One auth instance per server process, built on first use so `next build` doesn't need the
// secret. Async to keep call sites unchanged from the per-request Workers version.
export async function getAuth() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set")

  auth ??= createAuth({
    db: getDb(),
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    cookieDomain: process.env.COOKIE_DOMAIN,
    ipAddressHeaders: [RESOLVED_IP_HEADER],
    ...getOAuthCredentials(),
    plugins: [nextCookies()],
  })
  return auth
}

export async function getSocialProviders(): Promise<SocialProvider[]> {
  const configured = getOAuthCredentials()

  return (["github", "google"] as const).filter((provider) => configured[provider])
}

export const getSession = cache(async () => {
  const requestHeaders = await headers()
  const auth = await getAuth()

  return auth.api.getSession({ headers: requestHeaders })
})

// For pages behind sign-in: returns the session or sends the visitor to /sign-in.
export async function requireSession() {
  const session = await getSession()
  if (!session) redirect("/sign-in")

  return session
}

// The signed-in user's Settings preferences, or the defaults for visitors.
export async function getPreferences() {
  const session = await getSession()
  return parsePreferences(session?.user.preferences)
}
