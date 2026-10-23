import { createHash } from "node:crypto"
import { and, eq, type SQLWrapper, sql } from "drizzle-orm"
import { z } from "zod"
import type { Database } from "./index"
import { moderationEvent, moderationState, paste } from "./schema"

export type ModerationState = (typeof moderationState.enumValues)[number]

export function allowedPaste() {
  return eq(paste.moderationState, "allowed")
}

export function allowedParent(id: SQLWrapper) {
  return sql`exists (select 1 from ${paste} where ${paste.id} = ${id} and ${allowedPaste()})`
}

const version = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1)
export const moderationCommandSchema = z.strictObject({
  commandId: z.uuid(),
  pasteId: z.uuid(),
  expectedContentVersion: version,
  expectedModerationVersion: version,
  state: z.enum(moderationState.enumValues),
  reasonCode: z.enum(["review", "policy_violation", "legal_request", "appeal", "correction"]),
  caseReference: z.uuid(),
})

export async function inspectModeration(db: Database, id: unknown) {
  const pasteId = z.uuid().parse(id)
  const [row] = await db
    .select({
      pasteId: paste.id,
      contentVersion: paste.version,
      moderationVersion: paste.moderationVersion,
      state: paste.moderationState,
    })
    .from(paste)
    .where(eq(paste.id, pasteId))
  return row ?? null
}

export async function transitionModeration(db: Database, input: unknown, hostActor: string) {
  const command = moderationCommandSchema.parse(input)
  const actor = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_.:@-]+$/)
    .parse(hostActor)
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...command, actor }))
    .digest("hex")
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${command.commandId}, 0))`)
    const [previous] = await tx
      .select()
      .from(moderationEvent)
      .where(eq(moderationEvent.commandId, command.commandId))
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new Error("Moderation command ID already used with different inputs.")
      return previous
    }
    const [current] = await tx
      .select()
      .from(paste)
      .where(eq(paste.id, command.pasteId))
      .for("update")
    if (!current) throw new Error("Paste not found.")
    if (
      current.version !== command.expectedContentVersion ||
      current.moderationVersion !== command.expectedModerationVersion
    ) {
      throw new Error("Moderation version conflict. Inspect the paste again.")
    }
    await tx
      .update(paste)
      .set({
        moderationState: command.state,
        moderationVersion: current.moderationVersion + 1,
        version: current.version + 1,
      })
      .where(and(eq(paste.id, current.id), eq(paste.version, current.version)))
    const [event] = await tx
      .insert(moderationEvent)
      .values({
        commandId: command.commandId,
        fingerprint,
        pasteId: current.id,
        actor,
        fromState: current.moderationState,
        toState: command.state,
        reasonCode: command.reasonCode,
        caseReference: command.caseReference,
        contentVersion: current.version,
        moderationVersion: current.moderationVersion + 1,
      })
      .returning()
    if (!event) throw new Error("Moderation audit insertion failed.")
    return event
  })
}
