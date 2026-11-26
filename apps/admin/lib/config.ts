import { z } from "zod"

// A per-account limit as the app reads it: a number, a size like "100MB" for storage, or
// "0", "unlimited", "none" or "off" for no limit. Units are binary, the same as the app's.
const NO_LIMIT = /^(0|unlimited|none|off)$/i
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
function limit(sizes: boolean) {
  return z.string().transform((value, ctx): number | null => {
    const trimmed = value.trim()
    if (NO_LIMIT.test(trimmed)) return null
    const match = trimmed.match(sizes ? /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i : /^(\d+)()$/)
    const factor = UNITS[match?.[2]?.toLowerCase() || "b"]
    const amount = match && factor ? Math.floor(Number(match[1]) * factor) : Number.NaN
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      ctx.addIssue({
        code: "custom",
        message: sizes
          ? 'must be a size like "100MB" or "unlimited".'
          : 'must be a whole number like 1000 or "unlimited".',
      })
      return z.NEVER
    }
    return amount
  })
}

// The admin app's settings. It runs next to a hosted Sniptide instance: the same database for drafts
// and the subscriber count, the same Resend segment for sending, and the app's URL for the logo,
// fonts and links in the email.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url({ message: "must be the Sniptide app's URL, like https://app.sniptide.com." }),
  ADMIN_PASSWORD: z.string().min(16, "must be at least 16 characters."),
  RESEND_API_KEY: z.string().min(1),
  RESEND_SEGMENT_ID: z.string().min(1),
  // One Resend topic per kind of email, so each send reaches only the people who chose that kind.
  RESEND_TOPIC_UPDATES: z.string().min(1),
  RESEND_TOPIC_SURVEYS: z.string().min(1),
  RESEND_TOPIC_GUIDES: z.string().min(1),
  BROADCAST_FROM: z.string().min(1),
  BROADCAST_TEST_TO: z.email(),
  // The same limits the app enforces, so the Accounts page measures against them.
  ACCOUNT_STORAGE_BYTES: limit(true).default(100 * 1024 ** 2),
  ACCOUNT_PASTE_LIMIT: limit(false).default(1000),
  // Where the weekly limits digest goes. Defaults to BROADCAST_TEST_TO.
  DIGEST_TO: z.email().optional(),
  OPERATOR_NAME: z.string().max(200).optional(),
  OPERATOR_ADDRESS: z.string().max(500).optional(),
})

// Read on every call, which is cheap here and lets tests change variables between calls.
export function getConfig(env: Record<string, string | undefined> = process.env) {
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
    appUrl: value.APP_URL,
    password: value.ADMIN_PASSWORD,
    resend: { apiKey: value.RESEND_API_KEY, segmentId: value.RESEND_SEGMENT_ID },
    topics: {
      update: value.RESEND_TOPIC_UPDATES,
      survey: value.RESEND_TOPIC_SURVEYS,
      guide: value.RESEND_TOPIC_GUIDES,
    },
    from: value.BROADCAST_FROM,
    testTo: value.BROADCAST_TEST_TO,
    digestTo: value.DIGEST_TO ?? value.BROADCAST_TEST_TO,
    limits: { bytes: value.ACCOUNT_STORAGE_BYTES, pastes: value.ACCOUNT_PASTE_LIMIT },
    operator: value.OPERATOR_NAME
      ? { name: value.OPERATOR_NAME, address: value.OPERATOR_ADDRESS }
      : undefined,
  }
}
