import "server-only"

import { createHash, randomBytes } from "node:crypto"
import type { Database } from "@workspace/db"
import { envGroup, envMember, envShare, envVariable, user } from "@workspace/db/schema"
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { initials } from "@/lib/format"
import { hashPassword, verifyPassword } from "@/lib/pastes/passwords"
import { hit } from "@/lib/rate-limit"
import { seconds } from "@/lib/time"
import { accountHandle, recordAudit } from "./audit"
import { decryptValue, encryptValue } from "./crypto"
import {
  MAX_GROUPS,
  MAX_MEMBERS,
  type MemberRole,
  type SecretSave,
  type SecretShare,
  variablesSchema,
} from "./inputs"

// Secret groups as the app reaches them. The owner does everything. An account the owner gave
// "read" sees the names and reveals values, and "write" also adds, edits and deletes variables.
// Settings, protected links, access, the audit log and deleting stay with the owner. Every
// function answers an account without access the way it answers a group that doesn't exist.

export type SecretRole = "owner" | MemberRole
type Group = typeof envGroup.$inferSelect
type Reader = Pick<Database, "select">

const context = (id: string, name: string) => `${id}:${name}`
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")
const web = (userId: string) => ({ via: "web", userId }) as const
const metadata = {
  id: envGroup.id,
  slug: envGroup.slug,
  project: envGroup.project,
  environment: envGroup.environment,
  revision: envGroup.revision,
  updatedAt: envGroup.updatedAt,
}

// The group and what `viewer` may do with it. `lock` holds the group row until the transaction
// ends, so a change and its audit entry see one state.
async function access(
  db: Reader,
  viewer: string,
  id: string,
  lock = false,
): Promise<{ group: Group; role: SecretRole } | null> {
  const query = db.select().from(envGroup).where(eq(envGroup.id, id))
  const [group] = lock ? await query.for("update") : await query
  if (!group) return null
  if (group.ownerId === viewer) return { group, role: "owner" }
  const [member] = await db
    .select({ role: envMember.role })
    .from(envMember)
    .where(and(eq(envMember.groupId, id), eq(envMember.userId, viewer)))
  return member ? { group, role: member.role } : null
}

async function owned(db: Reader, viewer: string, id: string) {
  const found = await access(db, viewer, id, true)
  return found?.role === "owner" ? found.group : null
}

// The groups an account owns and the ones shared with it. `owner` is the owning account's handle
// on a shared group and null on the viewer's own.
export async function listSecrets(viewer: string) {
  const rows = await getDb()
    .select({
      ...metadata,
      ownerId: envGroup.ownerId,
      role: envMember.role,
      username: user.username,
      displayUsername: user.displayUsername,
      email: user.email,
      count: sql<number>`(select count(*)::int from ${envVariable} where ${envVariable.groupId} = ${envGroup.id})`,
    })
    .from(envGroup)
    .innerJoin(user, eq(user.id, envGroup.ownerId))
    .leftJoin(envMember, and(eq(envMember.groupId, envGroup.id), eq(envMember.userId, viewer)))
    .where(or(eq(envGroup.ownerId, viewer), eq(envMember.userId, viewer)))
    .orderBy(asc(envGroup.project), asc(envGroup.environment), desc(envGroup.updatedAt))
  return rows.map(({ ownerId, role, username, displayUsername, email, ...row }) => {
    const name = displayUsername ?? username
    return {
      ...row,
      updatedAt: row.updatedAt.getTime(),
      role: ownerId === viewer ? ("owner" as const) : (role ?? ("read" as const)),
      owner: ownerId === viewer ? null : name ? `@${name}` : email,
    }
  })
}
export type SecretSummary = Awaited<ReturnType<typeof listSecrets>>[number]

async function listMembers(db: Reader, id: string) {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      displayUsername: user.displayUsername,
      role: envMember.role,
    })
    .from(envMember)
    .innerJoin(user, eq(envMember.userId, user.id))
    .where(eq(envMember.groupId, id))
    .orderBy(asc(envMember.createdAt), user.id)
  return rows.map((row) => {
    const username = row.displayUsername ?? row.username
    return {
      id: row.id,
      name: row.name,
      handle: username ? `@${username}` : row.email,
      initials: initials(row.name),
      role: row.role,
    }
  })
}

// A group without its values. Members and protected links are the owner's to see, so both come
// back empty for anyone else.
export async function secretDetail(viewer: string, id: string) {
  const db = getDb()
  const found = await access(db, viewer, id)
  if (!found) return null
  const { group, role } = found
  const entries = await db
    .select({ name: envVariable.name })
    .from(envVariable)
    .where(eq(envVariable.groupId, id))
    .orderBy(asc(envVariable.position))
  const isOwner = role === "owner"
  const shares = isOwner
    ? await db
        .select({ id: envShare.id, expiresAt: envShare.expiresAt })
        .from(envShare)
        .where(
          and(
            eq(envShare.groupId, id),
            isNull(envShare.revokedAt),
            gt(envShare.expiresAt, new Date()),
          ),
        )
    : []
  return {
    id: group.id,
    slug: group.slug,
    project: group.project,
    environment: group.environment,
    revision: group.revision,
    updatedAt: group.updatedAt.getTime(),
    role,
    viewer,
    owner: isOwner ? null : await accountHandle(db, group.ownerId),
    entries,
    shares: shares.map((share) => ({ ...share, expiresAt: share.expiresAt.getTime() })),
    members: isOwner ? await listMembers(db, id) : [],
  }
}
export type SecretDetail = NonNullable<Awaited<ReturnType<typeof secretDetail>>>

export async function saveSecret(viewer: string, id: string | null, input: SecretSave) {
  return getDb().transaction(async (tx) => {
    let group: Group | undefined
    let role: SecretRole = "owner"
    if (id) {
      const found = await access(tx, viewer, id, true)
      if (!found) return { status: "missing" } as const
      ;({ group, role } = found)
      if (role === "read") return { status: "forbidden" } as const
      if (group.revision !== input.revision) return { status: "conflict" } as const
    } else {
      if (!input.project || !input.environment) return { status: "invalid" } as const
      // Serializes group creation per account, so the group limit holds under concurrent saves.
      await tx.select({ id: user.id }).from(user).where(eq(user.id, viewer)).for("update")
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(envGroup)
        .where(eq(envGroup.ownerId, viewer))
      if ((count?.count ?? 0) >= MAX_GROUPS) return { status: "limit" } as const
      const [duplicate] = await tx
        .select({ id: envGroup.id })
        .from(envGroup)
        .where(and(eq(envGroup.ownerId, viewer), eq(envGroup.slug, input.slug)))
      if (duplicate) return { status: "duplicate" } as const
      ;[group] = await tx
        .insert(envGroup)
        .values({
          ownerId: viewer,
          slug: input.slug,
          project: input.project,
          environment: input.environment,
        })
        .returning()
    }
    if (!group) throw new Error("Secret group unavailable.")
    const project = input.project ?? group.project
    const environment = input.environment ?? group.environment
    const settings = project !== group.project || environment !== group.environment
    if (settings && role !== "owner") return { status: "forbidden" } as const
    const groupId = group.id
    const previous = await tx
      .select()
      .from(envVariable)
      .where(eq(envVariable.groupId, groupId))
      .orderBy(asc(envVariable.position))
    const touched = new Set(
      previous.filter((entry) => input.deleted.includes(entry.name)).map((entry) => entry.name),
    )
    const entries = new Map(
      previous.filter((entry) => !touched.has(entry.name)).map((entry) => [entry.name, entry]),
    )
    for (const entry of input.entries) {
      const old = entries.get(entry.name)
      if (old && entry.value === "" && !entry.replace) continue
      if (!old || decryptValue(old.value, context(groupId, entry.name)) !== entry.value)
        touched.add(entry.name)
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
      .set({ project, environment, revision: sql`${envGroup.revision} + 1`, updatedAt: new Date() })
      .where(eq(envGroup.id, groupId))
    if (!id || settings || touched.size)
      await recordAudit(tx, group, id ? "edit" : "create", web(viewer), {
        variables: [...touched],
        ...(id && settings ? { settings } : {}),
      })
    return { status: "ok", id: groupId } as const
  })
}

// One decrypted value, for anyone with access. The audit entry is written first, so a value is
// never returned without one.
export async function revealSecret(viewer: string, id: string, name: string) {
  return getDb().transaction(async (tx) => {
    const found = await access(tx, viewer, id)
    if (!found) return null
    const [entry] = await tx
      .select({ value: envVariable.value })
      .from(envVariable)
      .where(and(eq(envVariable.groupId, id), eq(envVariable.name, name)))
    if (!entry) return null
    await recordAudit(tx, found.group, "reveal", web(viewer), { variables: [name] })
    return decryptValue(entry.value, context(id, name))
  })
}

export async function removeSecret(viewer: string, id: string) {
  return getDb().transaction(async (tx) => {
    const group = await owned(tx, viewer, id)
    if (!group) return false
    await recordAudit(tx, group, "delete", web(viewer))
    await tx.delete(envGroup).where(eq(envGroup.id, id))
    return true
  })
}

export type GrantResult = { status: "ok" | "missing" | "limit" }

// Gives an account access to one of the viewer's groups, or changes the access it has.
export async function grantAccess(
  viewer: string,
  id: string,
  userId: string,
  role: MemberRole,
): Promise<GrantResult> {
  return getDb().transaction(async (tx) => {
    const group = await owned(tx, viewer, id)
    if (!group || userId === viewer) return { status: "missing" }
    const person = await accountHandle(tx, userId)
    if (!person) return { status: "missing" }
    const members = await tx
      .select({ userId: envMember.userId, role: envMember.role })
      .from(envMember)
      .where(eq(envMember.groupId, id))
    const current = members.find((member) => member.userId === userId)
    if (current?.role === role) return { status: "ok" }
    if (!current && members.length >= MAX_MEMBERS) return { status: "limit" }
    await tx
      .insert(envMember)
      .values({ groupId: id, userId, role })
      .onConflictDoUpdate({ target: [envMember.groupId, envMember.userId], set: { role } })
    await recordAudit(tx, group, "grant", web(viewer), { person, personId: userId, role })
    return { status: "ok" }
  })
}

// Takes an account's access away. The owner removes anyone, and a member removes themself.
export async function revokeAccess(viewer: string, id: string, userId: string) {
  return getDb().transaction(async (tx) => {
    const found = await access(tx, viewer, id, true)
    if (!found || (found.role !== "owner" && userId !== viewer)) return false
    const person = await accountHandle(tx, userId)
    const rows = await tx
      .delete(envMember)
      .where(and(eq(envMember.groupId, id), eq(envMember.userId, userId)))
      .returning({ userId: envMember.userId })
    if (!rows.length) return false
    if (userId === viewer) await recordAudit(tx, found.group, "leave", web(viewer))
    else
      await recordAudit(tx, found.group, "revoke", web(viewer), {
        person: person ?? undefined,
        personId: userId,
      })
    return true
  })
}

export async function createSecretShare(viewer: string, id: string, input: SecretShare) {
  const token = randomBytes(32).toString("base64url")
  const passwordHash = await hashPassword(input.password)
  return getDb().transaction(async (tx) => {
    const group = await owned(tx, viewer, id)
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
    await recordAudit(tx, group, "link_create", web(viewer))
    return token
  })
}
export async function revokeSecretShare(viewer: string, groupId: string, shareId: string) {
  return getDb().transaction(async (tx) => {
    const group = await owned(tx, viewer, groupId)
    if (!group) return false
    const rows = await tx
      .update(envShare)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(envShare.id, shareId), eq(envShare.groupId, groupId), isNull(envShare.revokedAt)),
      )
      .returning({ id: envShare.id })
    if (rows.length) await recordAudit(tx, group, "link_revoke", web(viewer))
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
      .select()
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
    await recordAudit(tx, group, "read", { via: "link" })
    return {
      status: "ok",
      entries: rows.map((row) => ({
        name: row.name,
        value: decryptValue(row.value, context(group.id, row.name)),
      })),
    } as const
  })
}
