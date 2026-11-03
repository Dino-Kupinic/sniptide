import "server-only"

import { randomUUID } from "node:crypto"
import { envInteger } from "@workspace/db/config"
import { allowedParent } from "@workspace/db/moderation"
import { notification, paste, pasteShare, user } from "@workspace/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { notificationEmail } from "@/lib/email/content"
import { renderEmail } from "@/lib/email/render"
import { createMailSender } from "@/lib/mail"
import { parsePreferences } from "@/lib/preferences-schema"
import { DAY } from "@/lib/time"
import { createUnsubscribeToken } from "./unsubscribe"

const LEASE_MS = 90_000
const MAX_ATTEMPTS = 5
const retryDelays = [60_000, 300_000, 900_000, 3_600_000]

async function claim(now: Date) {
  const token = randomUUID()
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.emailStatus, "pending"),
          sql`${notification.emailNextAttemptAt} <= ${now.toISOString()}`,
        ),
      )
      .orderBy(notification.emailNextAttemptAt, notification.id)
      .limit(1)
      .for("update", { skipLocked: true })
    if (!row) return null
    const [claimed] = await tx
      .update(notification)
      .set({
        emailClaimToken: token,
        emailAttempts: sql`${notification.emailAttempts} + 1`,
        emailNextAttemptAt: new Date(now.getTime() + LEASE_MS),
      })
      .where(eq(notification.id, row.id))
      .returning()
    return claimed ?? null
  })
}

type Claimed = NonNullable<Awaited<ReturnType<typeof claim>>>

async function finish(
  row: Claimed,
  fields: Partial<
    Pick<typeof notification.$inferInsert, "emailStatus" | "emailNextAttemptAt" | "emailSentAt">
  >,
) {
  await getDb()
    .update(notification)
    .set({ ...fields, emailClaimToken: null })
    .where(
      and(
        eq(notification.id, row.id),
        eq(notification.emailClaimToken, row.emailClaimToken ?? ""),
        eq(notification.emailStatus, "pending"),
      ),
    )
}

async function eligible(row: Claimed, now: Date) {
  if (row.createdAt.getTime() < now.getTime() - DAY || row.emailAttempts > MAX_ATTEMPTS) return null
  const [current] = await getDb()
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
      preferences: user.preferences,
      ownerId: paste.ownerId,
      slug: paste.slug,
      deletedAt: paste.deletedAt,
      burnedAt: paste.burnedAt,
      expiresAt: paste.expiresAt,
      expiryKey: sql<
        string | null
      >`'expiring:' || ${paste.id}::text || ':' || extract(epoch FROM ${paste.expiresAt})::bigint::text`,
      shareId: pasteShare.userId,
    })
    .from(notification)
    .innerJoin(user, eq(user.id, notification.userId))
    .innerJoin(paste, eq(paste.id, notification.pasteId))
    .leftJoin(
      pasteShare,
      and(
        eq(pasteShare.pasteId, paste.id),
        eq(pasteShare.userId, notification.userId),
        isNull(pasteShare.leftAt),
      ),
    )
    .where(
      and(
        and(allowedParent(notification.pasteId), eq(notification.id, row.id)),
        eq(notification.emailClaimToken, row.emailClaimToken ?? ""),
        eq(notification.emailStatus, "pending"),
      ),
    )
  if (
    !current?.emailVerified ||
    !parsePreferences(current.preferences).notifications[row.kind].email
  )
    return null
  const live = !current.deletedAt && (!current.expiresAt || current.expiresAt > now)
  if (row.kind === "shared") return live && current.shareId ? current : null
  if (current.ownerId !== row.userId) return null
  switch (row.kind) {
    case "burned":
      return current.burnedAt ? current : null
    case "views":
      return live ? current : null
    case "expiring":
      return live &&
        current.expiresAt &&
        current.expiresAt.getTime() <= now.getTime() + DAY &&
        current.expiryKey === row.dedupeKey
        ? current
        : null
  }
}

export async function deliverNotificationEmails() {
  const { smtp, appUrl, legal } = getConfig()
  const totals = { sent: 0, skipped: 0, retried: 0, failed: 0 }
  if (!smtp || !appUrl) return totals
  const concurrency = envInteger("NOTIFICATION_EMAIL_CONCURRENCY", 2, 1, 10)
  const started = Date.now()
  let attempts = 0
  const workers = await Promise.allSettled(
    Array.from({ length: concurrency }, async () => {
      const sender = createMailSender(smtp)
      try {
        while (attempts < 20 && Date.now() - started < 45_000) {
          attempts++
          const row = await claim(new Date())
          if (!row) break
          const recipient = await eligible(row, new Date())
          if (!recipient) {
            await finish(row, { emailStatus: "skipped", emailNextAttemptAt: null })
            totals.skipped++
            continue
          }
          const unsubscribe = new URL("/api/notifications/unsubscribe", appUrl)
          unsubscribe.searchParams.set(
            "token",
            createUnsubscribeToken(row.userId, recipient.email, row.kind),
          )
          const href =
            row.kind === "shared"
              ? "/shared"
              : row.kind === "burned"
                ? "/trash"
                : row.kind === "views"
                  ? "/analytics"
                  : "/pastes"
          const destination = new URL(href, appUrl).href
          const settings = new URL("/settings?tab=notifications", appUrl).href
          try {
            const email = await renderEmail(
              notificationEmail({
                kind: row.kind,
                to: recipient.email,
                url: destination,
                settingsUrl: settings,
                unsubscribeUrl: unsubscribe.href,
                appUrl,
                operator: legal.operator,
                locale: parsePreferences(recipient.preferences).locale,
              }),
            )
            await sender.send({
              from: smtp.from,
              to: recipient.email,
              ...email,
              messageId: `<notification-${row.id}@${new URL(appUrl).hostname}>`,
              headers: {
                "List-Unsubscribe": `<${unsubscribe.href}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            })
            await finish(row, {
              emailStatus: "sent",
              emailNextAttemptAt: null,
              emailSentAt: new Date(),
            })
            totals.sent++
          } catch {
            const retry =
              row.emailAttempts < MAX_ATTEMPTS && Date.now() - row.createdAt.getTime() < DAY
            await finish(row, {
              emailStatus: retry ? "pending" : "failed",
              emailNextAttemptAt: retry
                ? new Date(Date.now() + (retryDelays[row.emailAttempts - 1] ?? 3_600_000))
                : null,
            })
            totals[retry ? "retried" : "failed"]++
            console.warn(
              JSON.stringify({
                event: "notification_email_delivery_failed",
                notificationId: row.id,
                attempt: row.emailAttempts,
                retry,
              }),
            )
          }
        }
      } finally {
        sender.close()
      }
    }),
  )
  const failed = workers.find((worker) => worker.status === "rejected")
  if (failed) throw failed.reason
  return totals
}
