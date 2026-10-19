import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import type { Database } from "@workspace/db"
import * as schema from "@workspace/db/schema"
import { type BetterAuthPlugin, betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { username } from "better-auth/plugins/username"
import { assertAllowed, assertSignUpOpen, parseAllowlist } from "./allowlist"
import { DEMO_LOCKED_MESSAGE, DEMO_LOCKED_PATHS } from "./demo"
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
  // Prefix for Better Auth's cookie names (`<prefix>.session_token`), "better-auth" when unset.
  // Give each deployment that shares a cookie domain with another its own, so one deployment's
  // session cookie is never read by another that can't verify it.
  cookiePrefix?: string
  // Request headers that name the client's IP for rate limiting, most trusted first.
  ipAddressHeaders?: string[]
  // Better Auth turns its rate limits on in production only unless told otherwise.
  rateLimitEnabled?: boolean
  // False closes sign-up for everyone, whatever allowedEmails says. Existing accounts keep
  // signing in. Defaults to open.
  allowSignUp?: boolean
  // Comma-separated emails that may create an account. Unset or empty leaves sign-up open.
  allowedEmails?: string
  // True on a public demo instance (DEMO_MODE): everyone shares one guest account, so the calls
  // that would change or remove its sign-in details are refused.
  demo?: boolean
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
  cookiePrefix,
  ipAddressHeaders,
  rateLimitEnabled,
  allowSignUp = true,
  allowedEmails,
  demo = false,
  github,
  google,
  plugins = [],
}: AuthConfig) {
  const allowlist = parseAllowlist(allowedEmails)

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
      ...(cookiePrefix ? { cookiePrefix } : {}),
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (demo && DEMO_LOCKED_PATHS.has(ctx.path))
          throw new APIError("FORBIDDEN", { message: DEMO_LOCKED_MESSAGE })
      }),
    },
    databaseHooks: {
      user: {
        // Covers email sign-up and the first GitHub or Google sign-in alike.
        create: {
          before: async (user) => {
            assertSignUpOpen(allowSignUp)
            assertAllowed(allowlist, user.email)
            return { data: boundUserFields(user, "create") }
          },
        },
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
