import "server-only"

import { z } from "zod"
import { isWebhookUrl } from "@/lib/pastes/webhook-url"
import { DEFAULT_RESOURCE_LINKS } from "@/lib/resource-links"

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

// "true"/"false" (also 1/0, yes/no, on/off), in any case.
const flag = z.string().transform((value, ctx) => {
  const normalized = value.trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  ctx.addIssue({ code: "custom", message: 'must be "true" or "false".' })
  return z.NEVER
})

const origin = z.url({ message: "must be a full URL like https://sniptide.com." })

const schema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: flag.default(false),
  SMTP_REQUIRE_TLS: flag.default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  DATABASE_URL: z.string().optional(),
  MIGRATIONS_DIR: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().optional(),
  ENV_SECRETS_KEY: z.string().min(32, { message: "must be at least 32 characters." }).optional(),
  BETTER_AUTH_URL: origin.optional(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, { message: "may only contain letters, digits, - and _." })
    .optional(),
  ALLOW_SIGN_UP: flag.default(true),
  ALLOWED_EMAILS: z.string().optional(),
  WAITLIST_URL: z.url({ message: "must be a full URL like https://example.com/apply." }).optional(),
  SHARE_URL: origin.optional(),
  DEMO_MODE: flag.default(false),
  HOMEPAGE_URL: origin.default(DEFAULT_RESOURCE_LINKS.homepage),
  DOCS_URL: z
    .url({ message: "must be a full URL like https://docs.example.com." })
    .default(DEFAULT_RESOURCE_LINKS.documentation),
  HELP_URL: z
    .url({ message: "must be a full URL like https://example.com/support." })
    .default(DEFAULT_RESOURCE_LINKS.help),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GITHUB_TOKEN: z.string().optional(),
  SLACK_WEBHOOK_URL: z
    .string()
    .refine((value) => isWebhookUrl(value, "slack"), {
      message: "must be a Slack incoming webhook URL.",
    })
    .optional(),
  DISCORD_WEBHOOK_URL: z
    .string()
    .refine((value) => isWebhookUrl(value, "discord"), {
      message: "must be a Discord incoming webhook URL.",
    })
    .optional(),
  MAX_PASTE_SIZE: size.default(1024 * 1024),

  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: origin.default("https://us.i.posthog.com"),
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
  const smtpPresent = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_REQUIRE_TLS",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
  ].some((key) => present[key] !== undefined)
  if (
    smtpPresent &&
    (!value.SMTP_HOST ||
      !value.SMTP_PORT ||
      !value.SMTP_FROM ||
      !value.BETTER_AUTH_URL ||
      !value.BETTER_AUTH_SECRET ||
      value.BETTER_AUTH_SECRET.length < 32 ||
      Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD))
  ) {
    throw new Error(
      "Invalid configuration: SMTP requires SMTP_HOST, SMTP_PORT, SMTP_FROM, BETTER_AUTH_URL, BETTER_AUTH_SECRET (at least 32 characters), and paired SMTP_USER/SMTP_PASSWORD credentials.",
    )
  }

  return {
    smtp:
      smtpPresent && value.SMTP_HOST && value.SMTP_PORT && value.SMTP_FROM
        ? {
            host: value.SMTP_HOST,
            port: value.SMTP_PORT,
            from: value.SMTP_FROM,
            secure: value.SMTP_SECURE,
            requireTLS: value.SMTP_REQUIRE_TLS,
            auth:
              value.SMTP_USER && value.SMTP_PASSWORD
                ? { user: value.SMTP_USER, pass: value.SMTP_PASSWORD }
                : undefined,
          }
        : undefined,
    databaseUrl: value.DATABASE_URL,
    migrationsDir: value.MIGRATIONS_DIR,
    authSecret: value.BETTER_AUTH_SECRET,
    envSecretsKey: value.ENV_SECRETS_KEY,
    appUrl: value.BETTER_AUTH_URL,
    trustedOrigins: value.BETTER_AUTH_TRUSTED_ORIGINS,
    cookieDomain: value.COOKIE_DOMAIN,
    cookiePrefix: value.COOKIE_PREFIX,
    allowSignUp: value.ALLOW_SIGN_UP,
    allowedEmails: value.ALLOWED_EMAILS,
    waitlistUrl: value.WAITLIST_URL,
    shareUrl: value.SHARE_URL,
    demoMode: value.DEMO_MODE,
    resourceLinks: {
      homepage: value.HOMEPAGE_URL,
      documentation: value.DOCS_URL,
      help: value.HELP_URL,
    },
    github: oauth(value.GITHUB_CLIENT_ID, value.GITHUB_CLIENT_SECRET),
    google: oauth(value.GOOGLE_CLIENT_ID, value.GOOGLE_CLIENT_SECRET),
    githubToken: value.GITHUB_TOKEN,
    webhooks: { slack: value.SLACK_WEBHOOK_URL, discord: value.DISCORD_WEBHOOK_URL },
    maxPasteBytes: value.MAX_PASTE_SIZE,
    analytics: value.POSTHOG_KEY
      ? { key: value.POSTHOG_KEY, host: value.POSTHOG_HOST.replace(/\/$/, "") }
      : undefined,
  }
}

export type Config = ReturnType<typeof getConfig>
