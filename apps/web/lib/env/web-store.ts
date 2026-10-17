import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { envGroup, envShare, envVariable, user } from "@workspace/db/schema"
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/pastes/passwords"
import { hit } from "@/lib/rate-limit"
import { seconds } from "@/lib/time"
import { decryptValue, encryptValue } from "./crypto"
import { MAX_GROUPS, type SecretSave, type SecretShare, variablesSchema } from "./inputs"

const owned = (owner: string, id: string) => and(eq(envGroup.ownerId, owner), eq(envGroup.id, id))
const context = (id: string, name: string) => `${id}:${name}`
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")
const metadata = {
  id: envGroup.id,
  slug: envGroup.slug,
  project: envGroup.project,
  environment: envGroup.environment,
  revision: envGroup.revision,
  updatedAt: envGroup.updatedAt,
}
export async function listSecrets(owner: string) {
  const rows = await getDb()
    .select({
      ...metadata,
      count: sql<number>`(select count(*)::int from ${envVariable} where ${envVariable.groupId} = ${envGroup.id})`,
    })
    .from(envGroup)
    .where(eq(envGroup.ownerId, owner))
    .orderBy(asc(envGroup.project), asc(envGroup.environment), desc(envGroup.updatedAt))
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.getTime() }))
}
export type SecretSummary = Awaited<ReturnType<typeof listSecrets>>[number]
export async function secretDetail(owner: string, id: string) {
  const db = getDb()
  const [group] = await db.select(metadata).from(envGroup).where(owned(owner, id))
  if (!group) return null
  const entries = await db
    .select({ name: envVariable.name })
    .from(envVariable)
    .where(eq(envVariable.groupId, id))
    .orderBy(asc(envVariable.position))
  const shares = await db
    .select({ id: envShare.id, expiresAt: envShare.expiresAt })
    .from(envShare)
    .where(
      and(eq(envShare.groupId, id), isNull(envShare.revokedAt), gt(envShare.expiresAt, new Date())),
    )
  return {
    ...group,
    updatedAt: group.updatedAt.getTime(),
    entries,
    shares: shares.map((share) => ({ ...share, expiresAt: share.expiresAt.getTime() })),
  }
}
export type SecretDetail = NonNullable<Awaited<ReturnType<typeof secretDetail>>>
export async function saveSecret(owner: string, id: string | null, input: SecretSave) {
  return getDb().transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, owner)).for("update")
    let [group] = id ? await tx.select().from(envGroup).where(owned(owner, id)).for("update") : []
    if (id && !group) return { status: "missing" } as const
    if (group && group.revision !== input.revision) return { status: "conflict" } as const
    if (!group) {
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(envGroup)
        .where(eq(envGroup.ownerId, owner))
      if ((count?.count ?? 0) >= MAX_GROUPS) return { status: "limit" } as const
      const [duplicate] = await tx
        .select({ id: envGroup.id })
        .from(envGroup)
        .where(and(eq(envGroup.ownerId, owner), eq(envGroup.slug, input.slug)))
      if (duplicate) return { status: "duplicate" } as const
      ;[group] = await tx
        .insert(envGroup)
        .values({
          ownerId: owner,
          slug: input.slug,
          project: input.project,
          environment: input.environment,
        })
        .returning()
    }
    if (!group) throw new Error("Secret group unavailable.")
    const groupId = group.id
    const previous = await tx
      .select()
      .from(envVariable)
      .where(eq(envVariable.groupId, groupId))
      .orderBy(asc(envVariable.position))
    const entries = new Map(
      previous
        .filter((entry) => !input.deleted.includes(entry.name))
        .map((entry) => [entry.name, entry]),
    )
    for (const entry of input.entries) {
      const old = entries.get(entry.name)
      if (old && entry.value === "" && !entry.replace) continue
      entries.set(entry.name, {
        groupId,
        name: entry.name,
        value: encryptValue(entry.value, context(groupId, entry.name)),
        position: old?.position ?? entries.size,
      })
    }
    const rows = [...entries.values()]
    const valid = variablesSchema.safeParse(
      rows.map((entry) => ({
        name: entry.name,
        value: decryptValue(entry.value, context(groupId, entry.name)),
      })),
    )
    if (!valid.success) throw new Error("Secret group limits exceeded.")
    await tx.delete(envVariable).where(eq(envVariable.groupId, groupId))
    if (rows.length)
      await tx.insert(envVariable).values(rows.map((entry, position) => ({ ...entry, position })))
    await tx
      .update(envGroup)
      .set({
        project: input.project,
        environment: input.environment,
        revision: sql`${envGroup.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(envGroup.id, groupId))
    return { status: "ok", id: groupId } as const
  })
}
export async function revealSecret(owner: string, id: string, name: string) {
  const [entry] = await getDb()
    .select({ value: envVariable.value })
    .from(envVariable)
    .innerJoin(envGroup, eq(envGroup.id, envVariable.groupId))
    .where(and(owned(owner, id), eq(envVariable.name, name)))
  return entry ? decryptValue(entry.value, context(id, name)) : null
}
export async function removeSecret(owner: string, id: string) {
  const rows = await getDb().delete(envGroup).where(owned(owner, id)).returning({ id: envGroup.id })
  return rows.length > 0
}
export async function createSecretShare(owner: string, id: string, input: SecretShare) {
  const token = randomBytes(32).toString("base64url")
  const passwordHash = await hashPassword(input.password)
  return getDb().transaction(async (tx) => {
    const [group] = await tx
      .select({ id: envGroup.id })
      .from(envGroup)
      .where(owned(owner, id))
      .for("update")
    if (!group) return null
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(envShare)
      .where(
        and(
          eq(envShare.groupId, id),
          isNull(envShare.revokedAt),
          gt(envShare.expiresAt, new Date()),
        ),
      )
    if ((count?.count ?? 0) >= 20) return null
    await tx.insert(envShare).values({
      groupId: id,
      tokenHash: hashToken(token),
      passwordHash,
      expiresAt: new Date(Date.now() + input.hours * 3600000),
    })
    return token
  })
}
export async function revokeSecretShare(owner: string, groupId: string, shareId: string) {
  return getDb().transaction(async (tx) => {
    const [group] = await tx
      .select({ id: envGroup.id })
      .from(envGroup)
      .where(owned(owner, groupId))
      .for("update")
    if (!group) return false
    const rows = await tx
      .update(envShare)
      .set({ revokedAt: new Date() })
      .where(and(eq(envShare.id, shareId), eq(envShare.groupId, groupId)))
      .returning({ id: envShare.id })
    return rows.length > 0
  })
}
export async function revealSharedSecret(token: string, password: string, address: string) {
  const tokenHash = hashToken(token)
  const limits = await hit([
    { key: `secret-share:${tokenHash}`, max: 30, windowSeconds: seconds(900) },
    { key: `secret-ip:${hashToken(address)}`, max: 60, windowSeconds: seconds(900) },
  ])
  if (!limits.allowed)
    return { status: "limited", retryAfterSeconds: limits.retryAfterSeconds } as const
  return getDb().transaction(async (tx) => {
    const [candidate] = await tx
      .select({ groupId: envShare.groupId })
      .from(envShare)
      .where(eq(envShare.tokenHash, tokenHash))
    if (!candidate) return { status: "locked" } as const
    const [group] = await tx
      .select(metadata)
      .from(envGroup)
      .where(eq(envGroup.id, candidate.groupId))
      .for("share")
    if (!group) return { status: "locked" } as const
    const [share] = await tx
      .select()
      .from(envShare)
      .where(
        and(
          eq(envShare.tokenHash, tokenHash),
          isNull(envShare.revokedAt),
          gt(envShare.expiresAt, new Date()),
        ),
      )
      .for("share")
    if (
      !share ||
      !(await verifyPassword(password, share.passwordHash)) ||
      share.expiresAt.getTime() <= Date.now()
    )
      return { status: "locked" } as const
    const rows = await tx
      .select()
      .from(envVariable)
      .where(eq(envVariable.groupId, group.id))
      .orderBy(asc(envVariable.position))
    return {
      status: "ok",
      entries: rows.map((row) => ({
        name: row.name,
        value: decryptValue(row.value, context(group.id, row.name)),
      })),
    } as const
  })
}
