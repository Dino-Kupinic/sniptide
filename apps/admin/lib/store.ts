import "server-only"

import { randomUUID } from "node:crypto"
import { broadcast, broadcastSubscription } from "@workspace/db/schema"
import { createResendClient, type ResendClient } from "@workspace/email/resend"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import {
  type BroadcastContent,
  type EmailDetails,
  FALLBACKS,
  monthLabel,
  renderBroadcastEmail,
  safeUrl,
} from "./compose"
import { getConfig } from "./config"
import { getDb } from "./db"
import { type EmailKind, isEmailKind } from "./kinds"

// Emails to subscribers: drafts that autosave, a test copy to the operator, and one send to every
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
  | "noUrl"
  | "noOperator"
  | "testFailed"
  | "sendFailed"
  | "signedOut"

export type BroadcastResult = { ok: true } | { ok: false; error: BroadcastError }

const LIMITS = { subject: 200, preview: 300, label: 60, imageUrl: 2000, body: 50_000 }
const DETAIL_LIMITS = { heading: 120, url: 2000, buttonLabel: 40, question: 200 }

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

// What a new draft of each kind starts with, so the composer shows real words to edit.
function starter(kind: EmailKind, now: Date) {
  switch (kind) {
    case "survey":
      return { details: { heading: FALLBACKS.surveyHeading, buttonLabel: FALLBACKS.surveyButton } }
    case "guide":
      return { label: FALLBACKS.guideLabel, details: { buttonLabel: FALLBACKS.guideButton } }
    default:
      return { label: monthLabel(now) }
  }
}

export async function createDraft(kind: EmailKind = "update", now = new Date()) {
  const id = randomUUID()
  await getDb()
    .insert(broadcast)
    .values({ id, kind, ...starter(kind, now) })
  return id
}

// Reads the details column, which holds JSON, back into the fields the templates know.
export function cleanDetails(input: unknown): EmailDetails {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const clean: EmailDetails = {}
  for (const key of ["heading", "url", "buttonLabel", "question"] as const) {
    const value = source[key]
    if (typeof value === "string") clean[key] = value.slice(0, DETAIL_LIMITS[key])
  }
  const minutes = Number(source.minutes)
  if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 120) clean.minutes = minutes
  return clean
}

// A stored row as the content the templates render.
export function rowContent(row: BroadcastRow): BroadcastContent {
  return {
    kind: isEmailKind(row.kind) ? row.kind : "update",
    subject: row.subject,
    preview: row.preview,
    label: row.label,
    imageUrl: row.imageUrl,
    body: row.body,
    details: cleanDetails(row.details),
  }
}

// Clips each field to its limit, so a pasted novel can't grow the row without bound.
// The kind is chosen when the draft is created and never changes.
export function cleanContent(
  input: Partial<BroadcastContent>,
): Partial<Omit<BroadcastContent, "kind">> {
  const clean: Partial<Omit<BroadcastContent, "kind">> = {}
  for (const key of ["subject", "preview", "label", "body"] as const)
    if (typeof input[key] === "string") clean[key] = input[key].slice(0, LIMITS[key])
  if (input.imageUrl === null || typeof input.imageUrl === "string")
    clean.imageUrl = input.imageUrl?.trim().slice(0, LIMITS.imageUrl) || null
  if (input.details !== undefined) clean.details = cleanDetails(input.details)
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

function missing(content: BroadcastContent): BroadcastError | null {
  if (!content.subject.trim()) return "noSubject"
  if (!content.body.trim()) return "noBody"
  // A survey is only useful with a link to answer it.
  if (content.kind === "survey" && !safeUrl(content.details.url)) return "noUrl"
  return null
}

export async function sendTest(id: string): Promise<BroadcastResult> {
  const resend = resendClient()
  const { from, testTo: to } = getConfig()
  const row = await getBroadcast(id)
  if (!row) return { ok: false, error: "notFound" }
  const content = rowContent(row)
  const problem = missing(content)
  if (problem) return { ok: false, error: problem }
  try {
    const email = await renderBroadcastEmail({ content, ...emailOptions(new Date()) })
    await resend.sendEmail({ from, to, ...email, subject: `[Test] ${email.subject}` })
  } catch (error) {
    console.error("Test email failed", error)
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
  const problem = missing(rowContent(row))
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
    const email = await renderBroadcastEmail({
      content: rowContent(claimed),
      ...emailOptions(sentAt),
    })
    providerId = await resend.createBroadcast({ name: claimed.subject, from, ...email })
    await resend.sendBroadcast(providerId)
  } catch (error) {
    console.error("Broadcast failed", error)
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
    .catch((error: unknown) => console.error("Recording a sent broadcast failed", error))
  return { ok: true }
}

export async function previewHtml(content: Partial<BroadcastContent>) {
  const clean = cleanContent(content)
  const { html } = await renderBroadcastEmail({
    content: {
      kind: isEmailKind(content.kind) ? content.kind : "update",
      details: clean.details ?? {},
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
