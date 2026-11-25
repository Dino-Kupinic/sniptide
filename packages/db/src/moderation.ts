import { createHash } from "node:crypto"
import { and, eq, isNotNull, type SQLWrapper, sql } from "drizzle-orm"
import { z } from "zod"
import type { Database } from "./index"
import { moderationEvent, moderationState, paste, safetyEvent, session, user } from "./schema"

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

// The moves an operator may make, and why. Any restricted state can be released or tightened, but
// a removed paste only comes back through an appeal or a correction, and a command that would
// leave the state as it is is refused instead of writing an empty audit event.
export function moderationTransitionError(
  from: ModerationState,
  to: ModerationState,
  reason: z.infer<typeof moderationCommandSchema>["reasonCode"],
): string | null {
  if (from === to) return `The paste is already ${to}.`
  if (from === "removed" && reason !== "appeal" && reason !== "correction")
    return "A removed paste can only change state with the appeal or correction reason."
  return null
}

export async function inspectModeration(db: Database, id: unknown) {
  const pasteId = z.uuid().parse(id)
  const [row] = await db
    .select({
      pasteId: paste.id,
      contentVersion: paste.version,
      moderationVersion: paste.moderationVersion,
      state: paste.moderationState,
      legalHoldCase: paste.legalHoldCase,
      legalHoldAt: paste.legalHoldAt,
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
    const invalid = moderationTransitionError(
      current.moderationState,
      command.state,
      command.reasonCode,
    )
    if (invalid) throw new Error(invalid)
    if (current.legalHoldCase && (command.state === "allowed" || command.state === "pending"))
      throw new Error("Release the legal hold before releasing the paste.")
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

const actorSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_.:@-]+$/)
export const legalHoldCommandSchema = z.strictObject({
  pasteId: z.uuid(),
  caseReference: z.uuid(),
})
export const suspensionCommandSchema = z.strictObject({
  userId: z.string().min(1).max(200),
  caseReference: z.uuid(),
})

// Places a legal hold on a restricted paste. The hold keeps the paste and its files and revisions
// from being deleted (a trigger refuses every DELETE), and a held paste can't be released to
// `allowed` or `pending`, so neither its owner nor the public can reach or edit it. Quarantine or
// remove the paste first. Placing the same hold again changes nothing.
export async function placeLegalHold(db: Database, input: unknown, hostActor: string) {
  const command = legalHoldCommandSchema.parse(input)
  const actor = actorSchema.parse(hostActor)
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(paste)
      .where(eq(paste.id, command.pasteId))
      .for("update")
    if (!current) throw new Error("Paste not found.")
    if (current.moderationState === "allowed" || current.moderationState === "pending")
      throw new Error("Quarantine or remove the paste before placing a legal hold.")
    if (current.legalHoldCase) {
      if (current.legalHoldCase !== command.caseReference)
        throw new Error("The paste is already held for another case.")
      return { pasteId: current.id, legalHoldCase: current.legalHoldCase }
    }
    await tx
      .update(paste)
      .set({ legalHoldCase: command.caseReference, legalHoldAt: sql`now()` })
      .where(eq(paste.id, current.id))
    await tx.insert(safetyEvent).values({
      kind: "hold_placed",
      pasteId: current.id,
      actor,
      caseReference: command.caseReference,
    })
    return { pasteId: current.id, legalHoldCase: command.caseReference }
  })
}

// Ends a legal hold. The paste stays in its moderation state and follows the normal lifecycle
// again, so an expired, trashed or removed paste becomes eligible for deletion.
export async function releaseLegalHold(db: Database, input: unknown, hostActor: string) {
  const command = legalHoldCommandSchema.parse(input)
  const actor = actorSchema.parse(hostActor)
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: paste.id, legalHoldCase: paste.legalHoldCase })
      .from(paste)
      .where(eq(paste.id, command.pasteId))
      .for("update")
    if (!current) throw new Error("Paste not found.")
    if (current.legalHoldCase !== command.caseReference)
      throw new Error("The paste isn't held for this case.")
    await tx
      .update(paste)
      .set({ legalHoldCase: null, legalHoldAt: null })
      .where(eq(paste.id, current.id))
    await tx.insert(safetyEvent).values({
      kind: "hold_released",
      pasteId: current.id,
      actor,
      caseReference: command.caseReference,
    })
    return { pasteId: current.id, legalHoldCase: null }
  })
}

// Whether any of the account's pastes is under a legal hold. Account deletion is refused while one
// is, because deleting the account would delete the paste.
export async function hasHeldPastes(db: Pick<Database, "select">, userId: string) {
  const [row] = await db
    .select({ id: paste.id })
    .from(paste)
    .where(and(eq(paste.ownerId, userId), isNotNull(paste.legalHoldCase)))
    .limit(1)
  return Boolean(row)
}

// Suspends an account: it signs out everywhere, can't sign in again, and its API and OAuth tokens
// stop working. Its pastes keep their moderation state, so restricting content stays a separate
// `transition`. Suspending a suspended account changes nothing.
export async function suspendAccount(db: Database, input: unknown, hostActor: string) {
  const command = suspensionCommandSchema.parse(input)
  const actor = actorSchema.parse(hostActor)
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: user.id, suspendedAt: user.suspendedAt })
      .from(user)
      .where(eq(user.id, command.userId))
      .for("update")
    if (!current) throw new Error("Account not found.")
    if (!current.suspendedAt) {
      await tx.update(user).set({ suspendedAt: new Date() }).where(eq(user.id, current.id))
      await tx.insert(safetyEvent).values({
        kind: "account_suspended",
        userId: current.id,
        actor,
        caseReference: command.caseReference,
      })
    }
    await tx.delete(session).where(eq(session.userId, current.id))
    return { userId: current.id, suspended: true }
  })
}

// Lifts a suspension. The account signs in again and its unexpired tokens work again.
export async function reinstateAccount(db: Database, input: unknown, hostActor: string) {
  const command = suspensionCommandSchema.parse(input)
  const actor = actorSchema.parse(hostActor)
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: user.id, suspendedAt: user.suspendedAt })
      .from(user)
      .where(eq(user.id, command.userId))
      .for("update")
    if (!current) throw new Error("Account not found.")
    if (!current.suspendedAt) throw new Error("The account isn't suspended.")
    await tx.update(user).set({ suspendedAt: null }).where(eq(user.id, current.id))
    await tx.insert(safetyEvent).values({
      kind: "account_reinstated",
      userId: current.id,
      actor,
      caseReference: command.caseReference,
    })
    return { userId: current.id, suspended: false }
  })
}
