import "server-only"

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createAuth, type OAuthCredentials } from "@workspace/auth"
import { createDb } from "@workspace/db"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { parsePreferences } from "@/lib/preferences-schema"

// OAuth apps are optional: set both halves in .dev.vars or with `wrangler secret put` to turn a
// provider on. They are not in wrangler.jsonc, so the generated CloudflareEnv doesn't know them.
type OAuthEnv = Partial<
  Record<
    "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET",
    string
  >
>

export type SocialProvider = "github" | "google"

function credentials(clientId?: string, clientSecret?: string): OAuthCredentials | undefined {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

const getOAuthCredentials = cache(async () => {
  const { env } = await getCloudflareContext({ async: true })
  const oauth = env as OAuthEnv

  return {
    github: credentials(oauth.GITHUB_CLIENT_ID, oauth.GITHUB_CLIENT_SECRET),
    google: credentials(oauth.GOOGLE_CLIENT_ID, oauth.GOOGLE_CLIENT_SECRET),
  }
})

// Bindings only exist inside a request on Workers, so the auth instance is built per request.
export const getAuth = cache(async () => {
  const { env } = await getCloudflareContext({ async: true })

  return createAuth({
    db: createDb(env.DB),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    ...(await getOAuthCredentials()),
    plugins: [nextCookies()],
  })
})

export async function getSocialProviders(): Promise<SocialProvider[]> {
  const configured = await getOAuthCredentials()

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
