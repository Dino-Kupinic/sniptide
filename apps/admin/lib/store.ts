import "server-only"

import { randomUUID } from "node:crypto"
import { broadcast, broadcastSubscription } from "@workspace/db/schema"
import { createResendClient, type ResendClient } from "@workspace/email/resend"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import { type BroadcastContent, monthLabel, renderBroadcastEmail } from "./compose"
import { getConfig } from "./config"
import { getDb } from "./db"

// Product updates: drafts that autosave, a test copy to the operator, and one send to every
// subscriber in the Resend segment.

let testClient: ResendClient | undefined

// Tests swap in a fake so they never reach Resend.
export function setResendClientForTests(client: ResendClient | undefined) {
  testClient = client
}

function resendClient() {
  return testClient ?? createResendClient(getConfig().resend)
}

export type BroadcastRow = typeof broadcast.$inferSelect

// Errors are codes, which the editor turns into a sentence.
export type BroadcastError =
  | "notFound"
  | "alreadySent"
  | "noSubject"
  | "noBody"
  | "noOperator"
  | "testFailed"
  | "sendFailed"
  | "signedOut"

export type BroadcastResult = { ok: true } | { ok: false; error: BroadcastError }

const LIMITS = { subject: 200, preview: 300, label: 60, imageUrl: 2000, body: 50_000 }

export async function listBroadcasts() {
  return getDb().select().from(broadcast).orderBy(desc(broadcast.updatedAt)).limit(200)
}

export async function getBroadcast(id: string) {
  const [row] = await getDb().select().from(broadcast).where(eq(broadcast.id, id))
  return row
}

export async function subscriberCount() {
  const [row] = await getDb().select({ value: count() }).from(broadcastSubscription)
  return row?.value ?? 0
}

export async function createDraft(now = new Date()) {
  const id = randomUUID()
  await getDb()
    .insert(broadcast)
    .values({ id, label: monthLabel(now) })
  return id
}

// Clips each field to its limit, so a pasted novel can't grow the row without bound.
export function cleanContent(input: Partial<BroadcastContent>): Partial<BroadcastContent> {
  const clean: Partial<BroadcastContent> = {}
  for (const key of ["subject", "preview", "label", "body"] as const)
    if (typeof input[key] === "string") clean[key] = input[key].slice(0, LIMITS[key])
  if (input.imageUrl === null || typeof input.imageUrl === "string")
    clean.imageUrl = input.imageUrl?.trim().slice(0, LIMITS.imageUrl) || null
  return clean
}

// Saves a draft. A sent broadcast is a record of what went out, so it no longer changes.
export async function saveDraft(id: string, input: Partial<BroadcastContent>) {
  const updated = await getDb()
    .update(broadcast)
    .set({ ...cleanContent(input), updatedAt: new Date() })
    .where(and(eq(broadcast.id, id), isNull(broadcast.sentAt)))
    .returning({ id: broadcast.id })
  return updated.length > 0
}

export async function deleteDraft(id: string) {
  const deleted = await getDb()
    .delete(broadcast)
    .where(and(eq(broadcast.id, id), isNull(broadcast.sentAt)))
    .returning({ id: broadcast.id })
  return deleted.length > 0
}

function emailOptions(date: Date) {
  const config = getConfig()
  return { date, appUrl: config.appUrl, operator: config.operator }
}

function missing(row: BroadcastRow): BroadcastError | null {
  if (!row.subject.trim()) return "noSubject"
  if (!row.body.trim()) return "noBody"
  return null
}

export async function sendTest(id: string): Promise<BroadcastResult> {
  const resend = resendClient()
  const { from, testTo: to } = getConfig()
  const row = await getBroadcast(id)
  if (!row) return { ok: false, error: "notFound" }
  const problem = missing(row)
  if (problem) return { ok: false, error: problem }
  try {
    const email = await renderBroadcastEmail({ content: row, ...emailOptions(new Date()) })
    await resend.sendEmail({ from, to, ...email, subject: `[Test] ${email.subject}` })
  } catch (error) {
    console.error("Product update test email failed", error)
    return { ok: false, error: "testFailed" }
  }
  return { ok: true }
}

// Sends a draft to the whole segment. Claiming the row first means two clicks, or two tabs,
// send one broadcast; a failed hand-off releases the claim so the writer can try again.
export async function sendToSubscribers(id: string): Promise<BroadcastResult> {
  const resend = resendClient()
  const config = getConfig()
  const from = config.from
  // Marketing email has to name its sender with a postal address.
  if (!config.operator) return { ok: false, error: "noOperator" }
  const row = await getBroadcast(id)
  if (!row) return { ok: false, error: "notFound" }
  if (row.sentAt) return { ok: false, error: "alreadySent" }
  const problem = missing(row)
  if (problem) return { ok: false, error: problem }
  const db = getDb()
  const sentAt = new Date()
  const [claimed] = await db
    .update(broadcast)
    .set({ sentAt })
    .where(and(eq(broadcast.id, id), isNull(broadcast.sentAt)))
    .returning()
  if (!claimed) return { ok: false, error: "alreadySent" }
  const recipients = await subscriberCount()
  let providerId: string
  try {
    const email = await renderBroadcastEmail({ content: claimed, ...emailOptions(sentAt) })
    providerId = await resend.createBroadcast({ name: claimed.subject, from, ...email })
    await resend.sendBroadcast(providerId)
  } catch (error) {
    console.error("Product update broadcast failed", error)
    await db.update(broadcast).set({ sentAt: null }).where(eq(broadcast.id, id))
    return {
      ok: false,
      error: "sendFailed",
    }
  }
  // The broadcast is out, so a failure here only loses the bookkeeping, never the sent state.
  await db
    .update(broadcast)
    .set({ providerId, recipients })
    .where(eq(broadcast.id, id))
    .catch((error: unknown) => console.error("Recording a sent product update failed", error))
  return { ok: true }
}

export async function previewHtml(content: Partial<BroadcastContent>) {
  const clean = cleanContent(content)
  const { html } = await renderBroadcastEmail({
    content: {
      subject: clean.subject ?? "",
      preview: clean.preview ?? "",
      label: clean.label ?? "",
      imageUrl: clean.imageUrl ?? null,
      body: clean.body ?? "",
    },
    ...emailOptions(new Date()),
  })
  return html
}
