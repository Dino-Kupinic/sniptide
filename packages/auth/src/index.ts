import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import type { Database } from "@workspace/db"
import * as schema from "@workspace/db/schema"
import { type BetterAuthPlugin, betterAuth } from "better-auth"
import { username } from "better-auth/plugins/username"
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
