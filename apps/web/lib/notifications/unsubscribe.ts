import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { changePreferences } from "@/lib/preference-store"
import { DAY } from "@/lib/time"
import { NOTIFICATION_KINDS, type NotificationKind } from "./types"

const purpose = "notification-email-unsubscribe-v1"
const payloadSchema = z
  .object({
    purpose: z.literal(purpose),
    userId: z.string().min(1).max(256),
    emailHash: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.enum(NOTIFICATION_KINDS),
    expires: z.number().int().positive(),
  })
  .strict()
const emailHash = (email: string) => createHash("sha256").update(email).digest("hex")

export function createUnsubscribeToken(
  userId: string,
  email: string,
  kind: NotificationKind,
  now = Date.now(),
) {
  const secret = getConfig().authSecret
  if (!secret) throw new Error("Email unsubscribe signing is not configured.")
  const payload = Buffer.from(
    JSON.stringify({ purpose, userId, emailHash: emailHash(email), kind, expires: now + 30 * DAY }),
  ).toString("base64url")
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`
}

export function verifyUnsubscribeToken(token: string, now = Date.now()) {
  const secret = getConfig().authSecret
  if (!secret || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null
  const expected = createHmac("sha256", secret).update(payload).digest()
  const supplied = Buffer.from(signature, "base64url")
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    )
    return parsed.success && parsed.data.expires > now ? parsed.data : null
  } catch {
    return null
  }
}

export async function unsubscribeNotificationEmail(token: string) {
  const payload = verifyUnsubscribeToken(token)
  if (!payload) return false
  const [account] = await getDb()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, payload.userId))
  if (!account || emailHash(account.email) !== payload.emailHash) return false
  return changePreferences(
    payload.userId,
    (current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        [payload.kind]: { ...current.notifications[payload.kind], email: false },
      },
    }),
    account.email,
  )
}
