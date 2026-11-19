import "server-only"

// Sharing a paste with other accounts (paste_share): who a paste is shared with, inviting and
// removing people, and leaving or rejoining a share. An invited person sees the paste in Shared
// with me and can open it whatever its visibility or password.

import { parseAllowlist } from "@workspace/auth/allowlist"
import type { Database } from "@workspace/db"
import { allowedParent, allowedPaste } from "@workspace/db/moderation"
import { notification, pasteShare, paste as pasteTable, user } from "@workspace/db/schema"
import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { initials } from "@/lib/format"
import { recordNotifications } from "@/lib/notifications/record"

import { liveWhere } from "./lifecycle"
import { findOwned, findRecord, ms, recordExpired, requireViewerId, viewerId } from "./records"
import type { Access, Share, SharePerson } from "./types"

type PasteRecord = typeof pasteTable.$inferSelect

// What makes a paste show up for someone it's shared with: a share row for them on a live paste
// someone else owns. A burn-after-read paste is read once through its link, so a share never
// opens it in the app, and an expired one is gone for everyone but its owner.
export function sharedWithWhere(viewer: string) {
  return and(
    eq(pasteShare.userId, viewer),
    isNull(pasteShare.leftAt),
    ne(pasteTable.ownerId, viewer),
    allowedPaste(),
    liveWhere(),
    eq(pasteTable.burnAfterRead, false),
  )
}

function toShare(slug: string, row: typeof pasteShare.$inferSelect) {
  return {
    slug,
    access: row.access,
    sharedAt: ms(row.createdAt),
    seen: row.seenAt !== null,
  } satisfies Share & { seen: boolean }
}

// The viewer's share of a paste someone else owns, if it's open to them.
export async function getShare(slug: string): Promise<(Share & { seen: boolean }) | null> {
  const viewer = await viewerId()
  if (!viewer) return null
  const [row] = await getDb()
    .select({ share: pasteShare })
    .from(pasteShare)
    .innerJoin(
      pasteTable,
      and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
    )
    .where(and(allowedPaste(), eq(pasteTable.slug, slug), sharedWithWhere(viewer)))
  return row ? toShare(slug, row.share) : null
}

export async function markShareSeen(slug: string) {
  const viewer = await viewerId()
  if (!viewer) return
  await getDb()
    .update(pasteShare)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(pasteShare.userId, viewer),
        isNull(pasteShare.seenAt),
        inArray(
          pasteShare.pasteId,
          getDb()
            .select({ id: pasteTable.id })
            .from(pasteTable)
            .where(and(allowedPaste(), eq(pasteTable.slug, slug))),
        ),
      ),
    )
}

export async function isSharedWith(
  record: PasteRecord,
  viewer: string | null,
  db: Pick<Database, "select"> = getDb(),
  allowBurn = false,
) {
  if (!viewer || record.ownerId === viewer || (record.burnAfterRead && !allowBurn)) return false
  const [row] = await db
    .select({ access: pasteShare.access })
    .from(pasteShare)
    .where(
      and(
        and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, record.id)),
        eq(pasteShare.userId, viewer),
        isNull(pasteShare.leftAt),
      ),
    )
  return Boolean(row)
}

function handle(person: {
  username: string | null
  displayUsername: string | null
  email: string
}) {
  const username = person.displayUsername ?? person.username
  return username ? `@${username}` : person.email
}

// Everyone the viewer's paste is shared with, oldest invite first. Null when it isn't theirs.
export async function listPasteShares(slug: string): Promise<SharePerson[] | null> {
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return null
  const rows = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      displayUsername: user.displayUsername,
      image: user.image,
      access: pasteShare.access,
      createdAt: pasteShare.createdAt,
    })
    .from(pasteShare)
    .innerJoin(user, eq(pasteShare.userId, user.id))
    .where(
      and(
        and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, record.id)),
        isNull(pasteShare.leftAt),
      ),
    )
    .orderBy(asc(pasteShare.createdAt), user.id)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: handle(row),
    initials: initials(row.name),
    image: row.image,
    access: row.access,
    sharedAt: ms(row.createdAt),
  }))
}

export type PersonLookup =
  | { status: "ok"; person: Omit<SharePerson, "access" | "sharedAt"> }
  | { status: "missing" }
  | { status: "self" }

// Finds the account behind an exact email or username, for an invite. There's deliberately no
// partial match, so nobody can browse the accounts on an instance by typing letters.
export async function findPerson(identifier: string): Promise<PersonLookup> {
  const viewer = await requireViewerId()
  const text = identifier.trim().replace(/^@/, "").toLowerCase()
  if (!text) return { status: "missing" }
  const config = getConfig()
  const requireVerifiedEmail = Boolean(config.smtp || parseAllowlist(config.allowedEmails))
  const [row] = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      displayUsername: user.displayUsername,
      image: user.image,
    })
    .from(user)
    .where(
      or(
        and(
          sql`lower(${user.email}) = ${text}`,
          requireVerifiedEmail ? eq(user.emailVerified, true) : undefined,
        ),
        sql`lower(${user.username}) = ${text}`,
      ),
    )
    .limit(1)
  if (!row) return { status: "missing" }
  if (row.id === viewer) return { status: "self" }
  return {
    status: "ok",
    person: {
      id: row.id,
      name: row.name,
      handle: handle(row),
      initials: initials(row.name),
      image: row.image,
    },
  }
}

// Gives someone access to one of the viewer's pastes, or changes the access they have. A new
// invite shows up as unseen in their Shared with me. `sharedAt` backdates a new share, for undoing
// a revoke.
export async function sharePaste(
  slug: string,
  userId: string,
  access: Access,
  sharedAt?: Date,
): Promise<{ status: "ok" | "missing" | "expired" }> {
  const record = await findOwned(slug)
  if (!record || record.deletedAt || userId === record.ownerId) return { status: "missing" }
  const [person] = await getDb().select({ id: user.id }).from(user).where(eq(user.id, userId))
  if (!person) return { status: "missing" }
  return getDb().transaction(async (tx) => {
    const [locked] = await tx
      .select({
        id: pasteTable.id,
        deletedAt: pasteTable.deletedAt,
        expiresAt: pasteTable.expiresAt,
      })
      .from(pasteTable)
      .where(
        and(allowedPaste(), eq(pasteTable.id, record.id), eq(pasteTable.ownerId, record.ownerId)),
      )
      .for("update")
    if (!locked || locked.deletedAt) return { status: "missing" }
    if (recordExpired(locked)) return { status: "expired" }
    const [before] = await tx
      .select({ leftAt: pasteShare.leftAt })
      .from(pasteShare)
      .where(
        and(
          and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, record.id)),
          eq(pasteShare.userId, userId),
        ),
      )
    await tx
      .insert(pasteShare)
      .values({ pasteId: record.id, userId, access, ...(sharedAt ? { createdAt: sharedAt } : {}) })
      .onConflictDoUpdate({
        target: [pasteShare.pasteId, pasteShare.userId],
        set: {
          access,
          createdAt: sql`case when ${pasteShare.leftAt} is null then ${pasteShare.createdAt} else now() end`,
          seenAt: sql`case when ${pasteShare.leftAt} is null then ${pasteShare.seenAt} else null end`,
          leftAt: null,
        },
      })
    if (!sharedAt && (!before || before.leftAt)) {
      await recordNotifications(tx, [
        { userId, kind: "shared", pasteId: record.id, actorId: record.ownerId },
      ])
    }
    return { status: "ok" }
  })
}

export async function unsharePaste(slug: string, userId: string) {
  const record = await findOwned(slug)
  if (!record) return
  await getDb().transaction(async (tx) => {
    await tx
      .select({ id: pasteTable.id })
      .from(pasteTable)
      .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
      .for("update")
    await tx
      .delete(pasteShare)
      .where(
        and(
          and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, record.id)),
          eq(pasteShare.userId, userId),
        ),
      )
    await tx
      .delete(notification)
      .where(
        and(
          eq(notification.pasteId, record.id),
          eq(notification.userId, userId),
          eq(notification.kind, "shared"),
        ),
      )
  })
}

export async function leaveShare(slug: string) {
  const viewer = await requireViewerId()
  const record = await findRecord(slug)
  if (!record) return
  await getDb().transaction(async (tx) => {
    await tx
      .select({ id: pasteTable.id })
      .from(pasteTable)
      .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
      .for("update")
    await tx
      .update(pasteShare)
      .set({ leftAt: new Date() })
      .where(
        and(
          and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, record.id)),
          eq(pasteShare.userId, viewer),
          isNull(pasteShare.leftAt),
        ),
      )
    await tx
      .delete(notification)
      .where(
        and(
          eq(notification.pasteId, record.id),
          eq(notification.userId, viewer),
          eq(notification.kind, "shared"),
        ),
      )
  })
}

// Undoes `leaveShare`. False when there's nothing to take back: the viewer never left, or the
// owner revoked the share in the meantime (which deletes the row).
export async function restoreShare(slug: string) {
  const viewer = await requireViewerId()
  const record = await findRecord(slug)
  if (!record) return false
  return getDb().transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: pasteTable.id })
      .from(pasteTable)
      .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
      .for("update")
    if (!locked) return false
    const restored = await tx
      .update(pasteShare)
      .set({ leftAt: null })
      .where(
        and(
          eq(pasteShare.pasteId, record.id),
          eq(pasteShare.userId, viewer),
          isNotNull(pasteShare.leftAt),
        ),
      )
      .returning({ pasteId: pasteShare.pasteId })
    return restored.length > 0
  })
}
