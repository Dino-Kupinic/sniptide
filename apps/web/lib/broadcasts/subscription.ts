import "server-only"

import { broadcastSubscription, user } from "@workspace/db/schema"
import { createResendClient, type ResendClient } from "@workspace/email/resend"
import { EMAIL_TOPICS, type EmailTopic, type TopicIds } from "@workspace/email/topics"
import { eq } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"

let testClient: ResendClient | undefined

// Tests swap in a fake so they never reach Resend.
export function setResendClientForTests(client: ResendClient | undefined) {
  testClient = client
}

function resendClient() {
  const broadcasts = getConfig().broadcasts
  if (!broadcasts) return undefined
  return testClient ?? createResendClient(broadcasts)
}

// The kinds of email Settings offers: all three with the Resend topics configured, otherwise only
// product updates.
export function productEmailKinds(): EmailTopic[] {
  const broadcasts = getConfig().broadcasts
  if (!broadcasts) return []
  return broadcasts.topics ? [...EMAIL_TOPICS] : ["update"]
}

function topicIds(): TopicIds | undefined {
  return getConfig().broadcasts?.topics
}

// The kinds an account turned on, or none when it isn't subscribed.
export async function productEmailTopics(userId: string): Promise<EmailTopic[]> {
  const [row] = await getDb()
    .select({ topics: broadcastSubscription.topics })
    .from(broadcastSubscription)
    .where(eq(broadcastSubscription.userId, userId))
  return row ? EMAIL_TOPICS.filter((topic) => row.topics.includes(topic)) : []
}

export async function hasProductEmails(userId: string) {
  return (await productEmailTopics(userId)).length > 0
}

export type ProductEmailsResult = { ok: true } | { ok: false; error: string }

// Opts the contact in to exactly the chosen kinds. Without configured topics there is only one
// kind, and the segment alone decides who gets it.
async function syncTopics(resend: ResendClient, email: string, topics: string[]) {
  const ids = topicIds()
  if (!ids) return
  await resend.setTopics(
    email,
    EMAIL_TOPICS.map((topic) => ({ id: ids[topic], subscribed: topics.includes(topic) })),
  )
}

// Turns one kind of email on or off for an account. Turning off the last kind unsubscribes the
// contact. Resend is updated first, so a switch in Settings never says "on" for an address Resend
// doesn't have.
export async function setProductEmails(
  userId: string,
  enabled: boolean,
  topic: EmailTopic = "update",
): Promise<ProductEmailsResult> {
  const resend = resendClient()
  if (!resend || !productEmailKinds().includes(topic))
    return { ok: false, error: "Product update emails aren't available on this server." }
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
  const current = row?.topics ?? []
  const topics = EMAIL_TOPICS.filter((kind) => (kind === topic ? enabled : current.includes(kind)))
  try {
    if (topics.length > 0) {
      if (!account.emailVerified)
        return { ok: false, error: "Verify your email address before turning on product updates." }
      await resend.subscribe(account.email)
      await syncTopics(resend, account.email, topics)
      if (row && row.email !== account.email) await resend.remove(row.email)
      await db
        .insert(broadcastSubscription)
        .values({ userId, email: account.email, topics })
        .onConflictDoUpdate({
          target: broadcastSubscription.userId,
          set: { email: account.email, topics },
        })
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
  await syncTopics(resend, changed.email, row.topics)
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
