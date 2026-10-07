import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import type { Database } from "@workspace/db"
import * as schema from "@workspace/db/schema"
import { type BetterAuthPlugin, betterAuth } from "better-auth"

export interface AuthConfig {
  db: Database
  secret: string
  baseURL?: string
  trustedOrigins?: string
  plugins?: BetterAuthPlugin[]
}

export function createAuth({ db, secret, baseURL, trustedOrigins, plugins = [] }: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret,
    baseURL,
    trustedOrigins: trustedOrigins
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    emailAndPassword: {
      enabled: true,
    },
    plugins,
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
