import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import type { Database } from "@workspace/db"
import * as schema from "@workspace/db/schema"
import { type BetterAuthPlugin, betterAuth } from "better-auth"
import { username } from "better-auth/plugins/username"
import { boundUserFields } from "./user-fields"
import { USERNAME_PATTERN } from "./username"

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

export interface AuthConfig {
  db: Database
  secret: string
  baseURL?: string
  trustedOrigins?: string
  // Domain to share the session cookie across subdomains (sniptide.com for app.sniptide.com and
  // the landing page). Leave unset to keep the cookie on the app's own host.
  cookieDomain?: string
  // Request headers that name the client's IP for rate limiting, most trusted first.
  ipAddressHeaders?: string[]
  // Better Auth turns its rate limits on in production only unless told otherwise.
  rateLimitEnabled?: boolean
  // Providers without credentials are left out, so the sign-in page can hide or disable them.
  github?: OAuthCredentials
  google?: OAuthCredentials
  plugins?: BetterAuthPlugin[]
}

export function createAuth({
  db,
  secret,
  baseURL,
  trustedOrigins,
  cookieDomain,
  ipAddressHeaders,
  rateLimitEnabled,
  github,
  google,
  plugins = [],
}: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret,
    baseURL,
    trustedOrigins: trustedOrigins
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    advanced: {
      ...(ipAddressHeaders?.length ? { ipAddress: { ipAddressHeaders } } : {}),
      ...(cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : {}),
    },
    // In Postgres rather than memory, so limits hold across restarts and deploys.
    rateLimit: { enabled: rateLimitEnabled, storage: "database", modelName: "authRateLimit" },
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        // Settings page preferences as JSON; parsed and validated in the web app.
        preferences: { type: "string", required: false, input: true },
      },
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      user: {
        create: { before: async (user) => ({ data: boundUserFields(user, "create") }) },
        update: { before: async (user) => ({ data: boundUserFields(user, "update") }) },
      },
    },
    socialProviders: {
      ...(github ? { github } : {}),
      ...(google ? { google } : {}),
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (value) => USERNAME_PATTERN.test(value),
      }),
      ...plugins,
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
