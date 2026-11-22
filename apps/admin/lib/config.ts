import { z } from "zod"

// The admin app's settings. It runs next to a hosted Sniptide instance: the same database for drafts
// and the subscriber count, the same Resend segment for sending, and the app's URL for the logo,
// fonts and links in the email.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url({ message: "must be the Sniptide app's URL, like https://app.sniptide.com." }),
  ADMIN_PASSWORD: z.string().min(16, "must be at least 16 characters."),
  RESEND_API_KEY: z.string().min(1),
  RESEND_SEGMENT_ID: z.string().min(1),
  BROADCAST_FROM: z.string().min(1),
  BROADCAST_TEST_TO: z.email(),
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
    from: value.BROADCAST_FROM,
    testTo: value.BROADCAST_TEST_TO,
    operator: value.OPERATOR_NAME
      ? { name: value.OPERATOR_NAME, address: value.OPERATOR_ADDRESS }
      : undefined,
  }
}
