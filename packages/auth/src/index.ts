import type { D1Database } from "@cloudflare/workers-types"
import { betterAuth } from "better-auth"
import { getMigrations } from "better-auth/db/migration"

export interface AuthEnv {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  BETTER_AUTH_TRUSTED_ORIGINS?: string
}

export function createAuth(env: AuthEnv) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    emailAndPassword: {
      enabled: true,
    },
  })
}

export function handleAuthRequest(request: Request, env: AuthEnv) {
  return createAuth(env).handler(request)
}

export async function migrateAuth(env: AuthEnv) {
  const { runMigrations } = await getMigrations(createAuth(env).options)

  await runMigrations()
}
