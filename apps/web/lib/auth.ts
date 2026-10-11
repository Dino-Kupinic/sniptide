import "server-only"

import { createAuth } from "@workspace/auth"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { RESOLVED_IP_HEADER } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { parsePreferences } from "@/lib/preferences-schema"

export type SocialProvider = "github" | "google"

let auth: ReturnType<typeof createAuth> | undefined

// One auth instance per server process, built on first use so `next build` doesn't need the
// secret. Async to keep call sites unchanged from the per-request Workers version.
export async function getAuth() {
  const config = getConfig()
  if (!config.authSecret) throw new Error("BETTER_AUTH_SECRET is not set")

  auth ??= createAuth({
    db: getDb(),
    secret: config.authSecret,
    baseURL: config.appUrl,
    trustedOrigins: config.trustedOrigins,
    cookieDomain: config.cookieDomain,
    ipAddressHeaders: [RESOLVED_IP_HEADER],
    github: config.github,
    google: config.google,
    plugins: [nextCookies()],
  })
  return auth
}

export async function getSocialProviders(): Promise<SocialProvider[]> {
  const configured = getConfig()

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
