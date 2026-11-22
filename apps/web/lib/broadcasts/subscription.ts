import "server-only"

import { broadcastSubscription, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { createResendClient, type ResendClient } from "./resend"

let testClient: ResendClient | undefined

// Tests swap in a fake so they never reach Resend.
export function setResendClientForTests(client: ResendClient | undefined) {
  testClient = client
}

export function resendClient() {
  const broadcasts = getConfig().broadcasts
  if (!broadcasts) return undefined
  return testClient ?? createResendClient(broadcasts)
}

// True when this instance offers product update emails (RESEND_API_KEY and RESEND_SEGMENT_ID).
export function productEmailsAvailable() {
  return Boolean(getConfig().broadcasts)
}

export async function hasProductEmails(userId: string) {
  const [row] = await getDb()
    .select({ userId: broadcastSubscription.userId })
    .from(broadcastSubscription)
    .where(eq(broadcastSubscription.userId, userId))
  return Boolean(row)
}

export type ProductEmailsResult = { ok: true } | { ok: false; error: string }

// Turns product update emails on or off for an account. Resend is updated first, so the switch in
// Settings never says "on" for an address Resend doesn't have.
export async function setProductEmails(
  userId: string,
  enabled: boolean,
): Promise<ProductEmailsResult> {
  const resend = resendClient()
  if (!resend) return { ok: false, error: "Product update emails aren't available on this server." }
  const db = getDb()
  const [account] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
  if (!account) return { ok: false, error: "Sign in again to change settings." }
  const [row] = await db
    .select()
    .from(broadcastSubscription)
    .where(eq(broadcastSubscription.userId, userId))
  try {
    if (enabled) {
      if (!account.emailVerified)
        return { ok: false, error: "Verify your email address before turning on product updates." }
      await resend.subscribe(account.email)
      if (row && row.email !== account.email) await resend.remove(row.email)
      await db
        .insert(broadcastSubscription)
        .values({ userId, email: account.email })
        .onConflictDoUpdate({ target: broadcastSubscription.userId, set: { email: account.email } })
    } else {
      await resend.unsubscribe(row?.email ?? account.email)
      await db.delete(broadcastSubscription).where(eq(broadcastSubscription.userId, userId))
    }
  } catch (error) {
    console.error("Product update email preference failed", error)
    return { ok: false, error: "Couldn't update product emails. Try again in a minute." }
  }
  return { ok: true }
}

// After an email change the contact moves to the new address, so updates follow the account and
// the old address stops getting them.
export async function followEmailChange(changed: { id: string; email: string }) {
  const resend = resendClient()
  if (!resend) return
  const db = getDb()
  const [row] = await db
    .select()
    .from(broadcastSubscription)
    .where(eq(broadcastSubscription.userId, changed.id))
  if (!row || row.email === changed.email) return
  await resend.subscribe(changed.email)
  await resend.remove(row.email)
  await db
    .update(broadcastSubscription)
    .set({ email: changed.email })
    .where(eq(broadcastSubscription.userId, changed.id))
}

// A deleted account's contact is deleted at Resend too. The row goes with the user.
export async function forgetAccount(deleted: { id: string }) {
  const resend = resendClient()
  if (!resend) return
  const [row] = await getDb()
    .select()
    .from(broadcastSubscription)
    .where(eq(broadcastSubscription.userId, deleted.id))
  if (row) await resend.remove(row.email)
}
