import "server-only"

import { createHash } from "node:crypto"
import type { Database } from "@workspace/db"
import {
  abuseReport,
  moderationEvent,
  moderationScan,
  paste,
  pasteFile,
  type ScreeningResult,
} from "@workspace/db/schema"
import { and, asc, eq, lte, sql } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { MINUTE } from "@/lib/time"
import { screeningInput } from "./content"
import { actionOf, decide, type Finding, POLICY_VERSION } from "./policy"
import {
  type Fetcher,
  lookUpLinks,
  moderateWithMistral,
  moderateWithOpenAI,
  ProviderError,
  type TextVerdict,
} from "./providers"
import { spamVerdict } from "./spam"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
type ModerationConfig = NonNullable<ReturnType<typeof getConfig>["moderation"]>

// How many rows one run screens, and how long a picked-up row stays leased to that run before
// another run may pick it up again.
const BATCH = 10
const LEASE_MS = 5 * MINUTE
// After this many failed attempts a paste stops retrying and goes to the review queue, so a
// reviewer knows it was never screened.
export const MAX_ATTEMPTS = 8

// Waits 1, 2, 4, 8, 16, 32 and 64 minutes, then two hours, between attempts.
export function retryDelay(attempts: number) {
  return Math.min(2 ** Math.max(0, attempts - 1), 120) * MINUTE
}

// Queues a paste for screening after a write, in the write's own transaction. Only public and
// unlisted pastes are screened: a private paste is reachable by its owner and the people it is
// shared with, so it stays out of screening, and so does an end-to-end encrypted paste, whose
// content the server can't read. Making a paste private drops its queued screening.
export async function queueScreening(tx: Transaction, pasteId: string) {
  if (!getConfig().moderation) return
  const [row] = await tx
    .select({
      version: paste.version,
      visibility: paste.visibility,
      encryptionKeyId: paste.encryptionKeyId,
      deletedAt: paste.deletedAt,
    })
    .from(paste)
    .where(eq(paste.id, pasteId))
  if (!row) return
  if (row.visibility === "private" || row.encryptionKeyId || row.deletedAt) {
    await tx.delete(moderationScan).where(eq(moderationScan.pasteId, pasteId))
    return
  }
  const now = new Date()
  const queued = {
    contentVersion: row.version,
    status: "queued" as const,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    queuedAt: now,
    updatedAt: now,
  }
  await tx
    .insert(moderationScan)
    .values({ pasteId, ...queued })
    .onConflictDoUpdate({ target: moderationScan.pasteId, set: queued })
}

// Leases the rows that are due, so concurrent runs and replicas never screen the same row twice.
async function claim(db: Database, now: Date) {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        pasteId: moderationScan.pasteId,
        contentVersion: moderationScan.contentVersion,
        attempts: moderationScan.attempts,
      })
      .from(moderationScan)
      .where(and(eq(moderationScan.status, "queued"), lte(moderationScan.nextAttemptAt, now)))
      .orderBy(asc(moderationScan.nextAttemptAt))
      .limit(BATCH)
      .for("update", { skipLocked: true })
    for (const row of due) {
      await tx
        .update(moderationScan)
        .set({
          attempts: row.attempts + 1,
          nextAttemptAt: new Date(now.getTime() + LEASE_MS),
          updatedAt: now,
        })
        .where(eq(moderationScan.pasteId, row.pasteId))
    }
    return due.map((row) => ({ ...row, attempts: row.attempts + 1 }))
  })
}

async function loadPaste(db: Database, pasteId: string) {
  const [row] = await db
    .select({
      slug: paste.slug,
      title: paste.title,
      description: paste.description,
      visibility: paste.visibility,
      encryptionKeyId: paste.encryptionKeyId,
      deletedAt: paste.deletedAt,
      moderationState: paste.moderationState,
    })
    .from(paste)
    .where(eq(paste.id, pasteId))
  if (!row) return null
  const files = await db
    .select({ name: pasteFile.name, content: pasteFile.content })
    .from(pasteFile)
    .where(eq(pasteFile.pasteId, pasteId))
    .orderBy(asc(pasteFile.position))
  return { ...row, files }
}

// Runs the text check with OpenAI first and Mistral as the fallback. Throws when every configured
// text provider failed, so the row is retried. Returns null when no text provider is configured.
async function checkText(config: ModerationConfig, fetcher: Fetcher, chunks: string[]) {
  if (!chunks.length) return null
  const attempts: [string | undefined, typeof moderateWithOpenAI][] = [
    [config.openai, moderateWithOpenAI],
    [config.mistral, moderateWithMistral],
  ]
  let failure: unknown = null
  for (const [key, check] of attempts) {
    if (!key) continue
    try {
      return await check(fetcher, key, chunks)
    } catch (error) {
      failure = error
    }
  }
  if (failure) throw failure
  return null
}

export async function screen(
  config: ModerationConfig,
  fetcher: Fetcher,
  content: Parameters<typeof screeningInput>[0],
): Promise<{ result: ScreeningResult; findings: Finding[] }> {
  const input = screeningInput(content)
  const text: TextVerdict | null = await checkText(config, fetcher, input.chunks)
  const links =
    config.webRisk && input.urls.length
      ? await lookUpLinks(fetcher, config.webRisk, input.urls)
      : null
  const spam = spamVerdict(input.chunks.join("\n"), input.urls)
  const findings = decide({ text, threats: links?.threats ?? [], spam })
  return { result: { text, links, spam, action: actionOf(findings) }, findings }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

// Files one review-queue report per finding. The explanation names the provider, the categories
// and their scores and never quotes the paste. A retried run files nothing new, because the
// deduplication key covers the paste, the content version and the category.
async function fileReports(
  tx: Transaction,
  target: { pasteId: string; slug: string; contentVersion: number },
  findings: { category: Finding["category"]; summary: string }[],
  source: string,
) {
  const ids = new Map<Finding["category"], string>()
  for (const finding of findings) {
    const key = fingerprint([
      "automated-screening",
      target.pasteId,
      target.contentVersion,
      finding.category,
    ])
    const [row] = await tx
      .insert(abuseReport)
      .values({
        deduplicationKey: key,
        target: target.slug,
        pasteId: target.pasteId,
        category: finding.category,
        explanation:
          `Automated screening (${source}, policy ${POLICY_VERSION}, content version ${target.contentVersion}): ${finding.summary}. A classifier result is a signal for review, not a determination.`.slice(
            0,
            2000,
          ),
        contact: "",
      })
      .onConflictDoUpdate({ target: abuseReport.deduplicationKey, set: { deduplicationKey: key } })
      .returning({ id: abuseReport.id })
    if (row) ids.set(finding.category, row.id)
  }
  return ids
}

// Quarantines a paste that is still allowed, with an audit event that names the screening source
// and the report it belongs to. The paste's owner and visitors lose access until a reviewer
// releases it with the host `transition` command.
async function quarantine(tx: Transaction, pasteId: string, caseReference: string, actor: string) {
  const [current] = await tx.select().from(paste).where(eq(paste.id, pasteId)).for("update")
  if (current?.moderationState !== "allowed") return false
  const commandId = crypto.randomUUID()
  await tx
    .update(paste)
    .set({
      moderationState: "quarantined",
      moderationVersion: current.moderationVersion + 1,
      version: current.version + 1,
    })
    .where(eq(paste.id, pasteId))
  await tx.insert(moderationEvent).values({
    commandId,
    fingerprint: fingerprint({ commandId, pasteId, actor, caseReference }),
    pasteId,
    actor,
    fromState: "allowed",
    toState: "quarantined",
    reasonCode: "review",
    caseReference,
    contentVersion: current.version,
    moderationVersion: current.moderationVersion + 1,
  })
  return true
}

type Outcome = "screened" | "skipped" | "stale" | "retry" | "failed"

async function screenOne(
  db: Database,
  config: ModerationConfig,
  fetcher: Fetcher,
  row: { pasteId: string; contentVersion: number; attempts: number },
  now: Date,
): Promise<Outcome> {
  const current = await loadPaste(db, row.pasteId)
  if (
    !current ||
    current.visibility === "private" ||
    current.encryptionKeyId ||
    current.deletedAt ||
    current.moderationState !== "allowed"
  ) {
    await db
      .delete(moderationScan)
      .where(
        and(
          eq(moderationScan.pasteId, row.pasteId),
          eq(moderationScan.contentVersion, row.contentVersion),
        ),
      )
    return "skipped"
  }
  let screened: Awaited<ReturnType<typeof screen>>
  try {
    screened = await screen(config, fetcher, current)
  } catch (error) {
    const reason = error instanceof ProviderError ? error.message : "screening error"
    return db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ contentVersion: moderationScan.contentVersion })
        .from(moderationScan)
        .where(eq(moderationScan.pasteId, row.pasteId))
        .for("update")
      if (latest?.contentVersion !== row.contentVersion) return "stale" as const
      const exhausted = row.attempts >= MAX_ATTEMPTS
      await tx
        .update(moderationScan)
        .set({
          status: exhausted ? "failed" : "queued",
          lastError: reason,
          nextAttemptAt: new Date(now.getTime() + retryDelay(row.attempts)),
          updatedAt: now,
        })
        .where(eq(moderationScan.pasteId, row.pasteId))
      if (exhausted)
        await fileReports(
          tx,
          { pasteId: row.pasteId, slug: current.slug, contentVersion: row.contentVersion },
          [
            {
              category: "other",
              summary: `screening did not complete after ${row.attempts} attempts (${reason}); the paste stayed readable`,
            },
          ],
          "screening failure",
        )
      return exhausted ? ("failed" as const) : ("retry" as const)
    })
  }
  return db.transaction(async (tx) => {
    // Apply the result only if no newer write queued the paste again while it was being screened.
    const [latest] = await tx
      .select({ contentVersion: moderationScan.contentVersion })
      .from(moderationScan)
      .where(eq(moderationScan.pasteId, row.pasteId))
      .for("update")
    if (latest?.contentVersion !== row.contentVersion) return "stale" as const
    await tx
      .update(moderationScan)
      .set({
        status: "done",
        lastError: null,
        policyVersion: POLICY_VERSION,
        result: screened.result,
        updatedAt: now,
      })
      .where(eq(moderationScan.pasteId, row.pasteId))
    if (!screened.findings.length) return "screened" as const
    const source =
      screened.result.text?.provider ?? (screened.result.links ? "web_risk" : "spam heuristics")
    const reports = await fileReports(
      tx,
      { pasteId: row.pasteId, slug: current.slug, contentVersion: row.contentVersion },
      screened.findings,
      source,
    )
    const restricting = screened.findings.find((finding) => finding.quarantine)
    const caseReference = restricting && reports.get(restricting.category)
    if (caseReference)
      await quarantine(
        tx,
        row.pasteId,
        caseReference,
        `automated-screening:${source.replace(/\s+/g, "_")}`,
      )
    return "screened" as const
  })
}

// Screens the queued pastes that are due. Returns how many were screened and how many failed, or
// null when screening is off.
export async function runScreening(options: { db?: Database; fetcher?: Fetcher; now?: Date } = {}) {
  const config = getConfig().moderation
  if (!config) return null
  const db = options.db ?? getDb()
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
  const now = options.now ?? new Date()
  const totals: Record<Outcome, number> = { screened: 0, skipped: 0, stale: 0, retry: 0, failed: 0 }
  for (const row of await claim(db, now)) totals[await screenOne(db, config, fetcher, row, now)]++
  return totals
}

// Counts for /api/metrics and alerts: how many shared pastes wait for screening, the oldest wait,
// and how many stopped retrying.
export async function screeningBacklog(db: Database = getDb()) {
  const [row] = await db
    .select({
      queued: sql<number>`count(*) filter (where ${moderationScan.status} = 'queued')::int`,
      failed: sql<number>`count(*) filter (where ${moderationScan.status} = 'failed')::int`,
      oldest: sql<Date | null>`min(${moderationScan.queuedAt}) filter (where ${moderationScan.status} = 'queued')`,
    })
    .from(moderationScan)
  return row ?? { queued: 0, failed: 0, oldest: null }
}
