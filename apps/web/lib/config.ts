import "server-only"

import { z } from "zod"

// Every setting the app reads from the environment, validated in one place. Each option, its
// default and what it does is documented in apps/web/.env.example.
//
// `getConfig()` reads the environment on every call (it's a handful of fields) and nothing runs at
// import time, so `next build` works without secrets and tests can change a variable between
// cases. A value it doesn't understand throws with the variable's name, so a typo stops the
// server instead of quietly using a default.
//
// Not here: CLIENT_IP_SOURCE, TRUSTED_PROXIES and TRUSTED_PROXY_HOPS, which lib/client-ip.ts
// validates and caches itself; SHARE_URL and BETTER_AUTH_URL in proxy.ts, which can't import
// server-only modules; and NODE_ENV and NEXT_RUNTIME, which Next.js owns.

const UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
}

// "1MB", "512 kb", "1.5MB" or a plain number of bytes. Units are binary (1 KB = 1024 bytes), the
// same as the sizes the app shows. Returns null for anything else.
export function parseSize(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/i)
  if (!match) return null
  const unit = match[2]?.toLowerCase() || "b"
  const factor = UNITS[unit]
  if (factor === undefined) return null
  const bytes = Math.floor(Number(match[1]) * factor)
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null
}

const size = z.string().transform((value, ctx) => {
  const bytes = parseSize(value)
  if (bytes === null) {
    ctx.addIssue({ code: "custom", message: 'must be a size like "1MB", "512KB" or "2097152".' })
    return z.NEVER
  }
  return bytes
})

const origin = z.url({ message: "must be a full URL like https://sniptide.com." })

const schema = z.object({
  DATABASE_URL: z.string().optional(),
  MIGRATIONS_DIR: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: origin.optional(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  SHARE_URL: origin.optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GITHUB_TOKEN: z.string().optional(),
  MAX_PASTE_SIZE: size.default(1024 * 1024),
})

function oauth(clientId?: string, clientSecret?: string) {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

export function getConfig(env: Record<string, string | undefined> = process.env) {
  // `FOO=` in an env file is "unset", not an empty value.
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ""),
  )
  const parsed = schema.safeParse(present)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`)
    throw new Error(`Invalid configuration:\n  ${problems.join("\n  ")}`)
  }
  const value = parsed.data

  return {
    databaseUrl: value.DATABASE_URL,
    migrationsDir: value.MIGRATIONS_DIR,
    authSecret: value.BETTER_AUTH_SECRET,
    appUrl: value.BETTER_AUTH_URL,
    trustedOrigins: value.BETTER_AUTH_TRUSTED_ORIGINS,
    cookieDomain: value.COOKIE_DOMAIN,
    shareUrl: value.SHARE_URL,
    github: oauth(value.GITHUB_CLIENT_ID, value.GITHUB_CLIENT_SECRET),
    google: oauth(value.GOOGLE_CLIENT_ID, value.GOOGLE_CLIENT_SECRET),
    githubToken: value.GITHUB_TOKEN,
    maxPasteBytes: value.MAX_PASTE_SIZE,
  }
}

export type Config = ReturnType<typeof getConfig>
