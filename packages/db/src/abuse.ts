import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import type { Database } from "./index"
import { abuseReport, abuseReviewEvent, moderationEvent, paste } from "./schema"

export const abuseCategories = [
  "child_exploitation",
  "sexual_content",
  "graphic_violence",
  "malware",
  "harassment",
  "other",
  "appeal",
] as const
export const abuseReportSchema = z.strictObject({
  target: z.string().regex(/^(?:[A-Za-z0-9_-]{1,128}|@[a-z0-9_-]{3,30}\/[A-Za-z0-9_-]{1,40})$/),
  category: z.enum(abuseCategories),
  explanation: z.string().trim().min(10).max(2000),
  contact: z.union([z.literal(""), z.email().max(254)]).default(""),
})

const actorSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_.:@-]+$/)

export async function submitAbuseReport(db: Database, input: unknown, deduplicationKey: string) {
  const report = abuseReportSchema.parse(input)
  const key = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(deduplicationKey)
  const [target] = await db
    .select({ id: paste.id })
    .from(paste)
    .where(eq(paste.slug, report.target))
  // Concurrent retries share one row. The public adapter never exposes the ID or duplicate state.
  const [row] = await db
    .insert(abuseReport)
    .values({ ...report, pasteId: target?.id, deduplicationKey: key })
    .onConflictDoUpdate({ target: abuseReport.deduplicationKey, set: { deduplicationKey: key } })
    .returning({ id: abuseReport.id })
  if (!row) throw new Error("Abuse intake failed.")
  return row
}

export async function listAbuseReports(db: Database, hostActor: string) {
  const actor = actorSchema.parse(hostActor)
  return db.transaction(async (tx) => {
    await tx.insert(abuseReviewEvent).values({ actor, operation: "list" })
    return tx
      .select({
        id: abuseReport.id,
        category: abuseReport.category,
        createdAt: abuseReport.createdAt,
      })
      .from(abuseReport)
      .where(isNull(abuseReport.resolvedAt))
      .orderBy(
        sql`case when ${abuseReport.category} = 'child_exploitation' then 0 else 1 end`,
        asc(abuseReport.createdAt),
        asc(abuseReport.id),
      )
      .limit(100)
  })
}

export async function inspectAbuseReport(db: Database, id: unknown, hostActor: string) {
  const reportId = z.uuid().parse(id)
  const actor = actorSchema.parse(hostActor)
  return db.transaction(async (tx) => {
    await tx.insert(abuseReviewEvent).values({ reportId, actor, operation: "inspect" })
    const [row] = await tx
      .select({
        id: abuseReport.id,
        target: abuseReport.target,
        pasteId: abuseReport.pasteId,
        category: abuseReport.category,
        explanation: abuseReport.explanation,
        contact: abuseReport.contact,
        createdAt: abuseReport.createdAt,
        resolvedAt: abuseReport.resolvedAt,
        outcome: abuseReport.outcome,
        decisionCommandId: abuseReport.decisionCommandId,
      })
      .from(abuseReport)
      .where(eq(abuseReport.id, reportId))
    return row ?? null
  })
}

const resolutionSchema = z.strictObject({
  id: z.uuid(),
  outcome: z.enum(["no_action", "duplicate", "quarantined", "removed", "restored"]),
  decisionCommandId: z.uuid().optional(),
})

export async function resolveAbuseReport(db: Database, input: unknown, hostActor: string) {
  const command = resolutionSchema.parse(input)
  const actor = actorSchema.parse(hostActor)
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(abuseReport)
      .where(eq(abuseReport.id, command.id))
      .for("update")
    if (!report || report.resolvedAt) throw new Error("Report missing or already resolved.")
    if (["quarantined", "removed", "restored"].includes(command.outcome)) {
      if (!command.decisionCommandId) throw new Error("A moderation decision is required.")
      const [event] = await tx
        .select()
        .from(moderationEvent)
        .where(
          and(
            eq(moderationEvent.commandId, command.decisionCommandId),
            eq(moderationEvent.caseReference, command.id),
          ),
        )
      const requiredState = command.outcome === "restored" ? "allowed" : command.outcome
      if (!event || event.pasteId !== report.pasteId || event.toState !== requiredState)
        throw new Error("Matching moderation decision not found.")
    } else if (command.decisionCommandId)
      throw new Error("This outcome has no moderation decision.")
    await tx
      .update(abuseReport)
      .set({
        resolvedAt: new Date(),
        outcome: command.outcome,
        decisionCommandId: command.decisionCommandId ?? null,
      })
      .where(eq(abuseReport.id, command.id))
    await tx
      .insert(abuseReviewEvent)
      .values({ reportId: command.id, actor, operation: "resolve", outcome: command.outcome })
    return { id: command.id, outcome: command.outcome }
  })
}
