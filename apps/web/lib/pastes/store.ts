import "server-only"

import { parseAllowlist } from "@workspace/auth/allowlist"
import type { Database } from "@workspace/db"
import { allowedParent, allowedPaste } from "@workspace/db/moderation"
import {
  notification,
  pasteFile,
  pasteRevision,
  pasteShare,
  pasteStar,
  paste as pasteTable,
  pasteViewDay,
  pasteVisit,
  user,
} from "@workspace/db/schema"
import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm"
import { cookies } from "next/headers"
import { cache } from "react"
import {
  defaultSidebarViews,
  type PasteSectionView,
  type SidebarViews,
} from "@/components/shell/sidebar-state"
import { getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { initials } from "@/lib/format"
import { recordNotifications } from "@/lib/notifications/record"
import { DAY } from "@/lib/time"
import { SLUG_PATTERN } from "./links"
import {
  changePasteSharing,
  createPasteRecord,
  type RestoreResult,
  replacePaste,
  restorePasteRevision,
  sealPasteRevision,
  trashPasteRecord,
  type UpdateOptions,
  type UpdateResult,
} from "./mutations"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

import { recordPasteEvent } from "./events"
import { hashPassword } from "./passwords"
import type { PastePreview } from "./preview"
import { TRASH_DAYS } from "./purge"

export { PasteBudgetError } from "./budget"

import { parsePasteInput } from "./schema"
import type {
  Access,
  NavCounts,
  Paste,
  PasteFile,
  PasteInput,
  PasteSummary,
  Person,
  Share,
  SharedPaste,
  ShareInvite,
  SharePerson,
  SharingInput,
  SidebarData,
} from "./types"
import { PASTE_SEARCH_LIMIT, PASTE_SEARCH_MAX_LENGTH, type PasteSearchResult } from "./types"
import { unlockCookieName, unlockToken } from "./unlock"

// Pastes in Postgres (packages/db/src/schema/pastes.ts). Every paste belongs to one account; the
// signed-in viewer sees their own pastes in the app, and anyone can open a paste's public link
// (subject to visibility, password and expiry).
//
// The owner can also invite other accounts by email or username (paste_share). An invited person
// sees the paste in Shared with me and can open it in the app and by its link, whatever its
// visibility or password, until the owner removes them or they leave.
//
// Content readers authorize before loading files: `getPaste` for app screens,
// `readSharedPaste` for share pages and `readRawFile` for raw downloads. Keep new content
// reads behind the same access rules.

export { TRASH_DAYS }
// How many days of views the charts show.
export const VIEW_HISTORY_DAYS = 60

type PasteRecord = typeof pasteTable.$inferSelect

async function viewerId() {
  return (await getSession())?.user.id ?? null
}

async function requireViewerId() {
  const id = await viewerId()
  if (!id) throw new Error("Sign in to change pastes.")
  return id
}

function utcDay(time: number) {
  return Math.floor(time / DAY)
}

// The tables store timestamps; the screens work in epoch milliseconds.
function ms(date: Date): number
function ms(date: Date | null): number | null
function ms(date: Date | null) {
  return date ? date.getTime() : null
}

// List summaries use the stored first language and size. View history and authors load in
// one query each; file contents and revisions stay unloaded.
async function summarize(
  records: PasteRecord[],
  viewer: string | null,
  withHistory = false,
  db: Pick<Database, "select"> = getDb(),
): Promise<PasteSummary[]> {
  if (records.length === 0) return []
  const ids = records.map((record) => record.id)
  const today = utcDay(Date.now())
  const firstDay = today - VIEW_HISTORY_DAYS + 1

  const [days, authors] = await Promise.all([
    withHistory
      ? db
          .select()
          .from(pasteViewDay)
          .where(
            and(
              and(allowedParent(pasteViewDay.pasteId), inArray(pasteViewDay.pasteId, ids)),
              gte(pasteViewDay.day, firstDay),
              lt(pasteViewDay.day, today + 1),
            ),
          )
      : [],
    db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        displayUsername: user.displayUsername,
      })
      .from(user)
      .where(inArray(user.id, [...new Set(records.map((record) => record.ownerId))])),
  ])

  return summariesOf(records, viewer, days, authors, withHistory, firstDay)
}

function summariesOf(
  records: PasteRecord[],
  viewer: string | null,
  days: (typeof pasteViewDay.$inferSelect)[],
  authors: Pick<typeof user.$inferSelect, "id" | "name" | "username" | "displayUsername">[],
  withHistory: boolean,
  firstDay: number,
): PasteSummary[] {
  const people = new Map<string, Person>(
    authors.map((author) => [
      author.id,
      {
        username: author.displayUsername ?? author.username ?? author.name,
        name: author.name,
        initials: initials(author.name),
        tone: "foreground",
      },
    ]),
  )

  const history = new Map<string, number[]>()
  for (const day of days) {
    let series = history.get(day.pasteId)
    if (!series) {
      series = Array<number>(VIEW_HISTORY_DAYS).fill(0)
      history.set(day.pasteId, series)
    }
    series[day.day - firstDay] = day.views
  }
  return records
    .filter((record) => record.firstLanguage !== null)
    .map((record) => {
      const viewsByDay = withHistory
        ? (history.get(record.id) ?? Array<number>(VIEW_HISTORY_DAYS).fill(0))
        : []
      const author = people.get(record.ownerId) ?? {
        username: "unknown",
        name: "Unknown",
        initials: "?",
        tone: "muted",
      }

      return {
        slug: record.slug,
        title: record.title,
        description: record.description,
        language: record.firstLanguage ?? "text",
        bytes: record.bytes,
        visibility: record.visibility,
        password: record.passwordHash,
        burnAfterRead: record.burnAfterRead,
        allowRaw: record.allowRaw,
        collection: record.collection,
        owner: record.ownerId === viewer ? null : author,
        author,
        views: record.views,
        uniqueViews: record.uniqueViews,
        agentReads: record.agentReads,
        viewsByDay,
        createdAt: ms(record.createdAt),
        updatedAt: ms(record.updatedAt),
        expiresAt: ms(record.expiresAt),
        deletedAt: ms(record.deletedAt),
      }
    })
}

// The full Paste for one record the viewer may read: its summary plus every file's content and
// the revision history.
async function hydrate(
  record: PasteRecord,
  viewer: string | null,
  requestedRevisionPage = 1,
): Promise<Paste | null> {
  const db = getDb()
  const today = utcDay(Date.now())
  const firstDay = today - VIEW_HISTORY_DAYS + 1
  const [{ revisionCount, revisionPageCount, revisionPage, revisions }, files, days, authors] =
    await Promise.all([
      (async () => {
        const [total] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(pasteRevision)
          .where(and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)))
        const revisionCount = total?.count ?? 0
        const revisionPageCount = Math.max(1, Math.ceil(revisionCount / 20))
        const revisionPage = Math.min(Math.max(1, requestedRevisionPage), revisionPageCount)
        const revisions = await db
          .select({
            id: pasteRevision.id,
            message: pasteRevision.message,
            createdAt: pasteRevision.createdAt,
            restorable: sql<boolean>`${pasteRevision.snapshot} is not null`,
          })
          .from(pasteRevision)
          .where(and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)))
          .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
          .limit(20)
          .offset((revisionPage - 1) * 20)
        return { revisionCount, revisionPageCount, revisionPage, revisions }
      })(),
      db
        .select({
          ...getTableColumns(pasteFile),
          bytes: sql<number>`octet_length(${pasteFile.content})::int`,
        })
        .from(pasteFile)
        .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
        .orderBy(pasteFile.position, pasteFile.id),
      db
        .select()
        .from(pasteViewDay)
        .where(
          and(
            allowedParent(pasteViewDay.pasteId),
            eq(pasteViewDay.pasteId, record.id),
            gte(pasteViewDay.day, firstDay),
            lt(pasteViewDay.day, today + 1),
          ),
        ),
      db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          displayUsername: user.displayUsername,
        })
        .from(user)
        .where(eq(user.id, record.ownerId)),
    ])
  const bytes = files.reduce((total, file) => total + file.bytes, 0)
  const [summary] = summariesOf(
    [{ ...record, bytes, firstLanguage: files[0]?.language ?? null }],
    viewer,
    days,
    authors,
    true,
    firstDay,
  )
  if (!summary || files.length === 0) return null

  return {
    ...summary,
    version: record.version,
    revisionCount,
    revisionPage,
    revisionPageCount,
    files: files.map(({ name, language, content }) => ({ name, language, content })),
    revisions: revisions.map(({ id, message, createdAt, restorable }) => ({
      id,
      message,
      createdAt: ms(createdAt),
      restorable,
    })),
  }
}

async function findRecord(slug: string, includeRestricted = false) {
  const [record] = await getDb()
    .select()
    .from(pasteTable)
    .where(and(includeRestricted ? undefined : allowedPaste(), eq(pasteTable.slug, slug)))
  return record ?? null
}

// A paste the viewer owns, trashed or not.
async function findOwned(slug: string, includeRestricted = false) {
  const viewer = await requireViewerId()
  const record = await findRecord(slug, includeRestricted)
  return record && record.ownerId === viewer ? record : null
}

export function isExpired(paste: Pick<Paste, "expiresAt">) {
  return paste.expiresAt !== null && paste.expiresAt <= Date.now()
}

function recordExpired(record: PasteRecord) {
  return isExpired({ expiresAt: ms(record.expiresAt) })
}

export async function purgeTrash(owner: string) {
  await getDb().execute(
    sql`DELETE FROM paste WHERE id IN (SELECT id FROM paste WHERE owner_id = ${owner} AND deleted_at < ${new Date(Date.now() - TRASH_DAYS * DAY).toISOString()} ORDER BY deleted_at, id LIMIT 500 FOR UPDATE SKIP LOCKED)`,
  )
}

export async function listOwnPastes() {
  const viewer = await viewerId()
  if (!viewer) return []
  const records = await getDb()
    .select()
    .from(pasteTable)
    .where(and(allowedPaste(), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt)))
    .orderBy(desc(pasteTable.updatedAt))
  return summarize(records, viewer)
}

export async function listTrash() {
  const viewer = await viewerId()
  if (!viewer) return []
  await purgeTrash(viewer)
  const records = await getDb()
    .select()
    .from(pasteTable)
    .where(
      and(
        allowedPaste(),
        eq(pasteTable.ownerId, viewer),
        sql`${pasteTable.deletedAt} >= ${new Date(Date.now() - TRASH_DAYS * DAY).toISOString()}`,
      ),
    )
    .orderBy(desc(pasteTable.deletedAt))
  return summarize(records, viewer)
}

// What makes a paste show up for someone it's shared with: a share row for them on a live paste
// someone else owns. A burn-after-read paste is read once through its link, so a share never
// opens it in the app, and an expired one is gone for everyone but its owner.
export function sharedWithWhere(viewer: string) {
  return and(
    eq(pasteShare.userId, viewer),
    isNull(pasteShare.leftAt),
    ne(pasteTable.ownerId, viewer),
    allowedPaste(),
    isNull(pasteTable.deletedAt),
    eq(pasteTable.burnAfterRead, false),
    or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, new Date())),
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

// Pastes other people shared with the viewer, newest share first.
export async function listShared(): Promise<
  { share: Share & { seen: boolean }; paste: PasteSummary }[]
> {
  const viewer = await viewerId()
  if (!viewer) return []
  const rows = await getDb()
    .select({ paste: pasteTable, share: pasteShare })
    .from(pasteShare)
    .innerJoin(
      pasteTable,
      and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
    )
    .where(sharedWithWhere(viewer))
    .orderBy(desc(pasteShare.createdAt), pasteTable.id)
  const summaries = await summarize(
    rows.map((row) => row.paste),
    viewer,
  )
  return rows.flatMap((row) => {
    const paste = summaries.find((summary) => summary.slug === row.paste.slug)
    return paste ? [{ share: toShare(row.paste.slug, row.share), paste }] : []
  })
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

async function isSharedWith(
  record: PasteRecord,
  viewer: string | null,
  db: Pick<Database, "select"> = getDb(),
) {
  if (!viewer || record.ownerId === viewer || record.burnAfterRead) return false
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
    person: { id: row.id, name: row.name, handle: handle(row), initials: initials(row.name) },
  }
}

// Gives someone access to one of the viewer's pastes, or changes the access they have. A new
// invite shows up as unseen in their Shared with me. `sharedAt` backdates a new share, for undoing
// a revoke.
export async function sharePaste(slug: string, userId: string, access: Access, sharedAt?: Date) {
  const record = await findOwned(slug)
  if (!record || record.deletedAt || userId === record.ownerId) return false
  const [person] = await getDb().select({ id: user.id }).from(user).where(eq(user.id, userId))
  if (!person) return false
  return getDb().transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: pasteTable.id, deletedAt: pasteTable.deletedAt })
      .from(pasteTable)
      .where(
        and(allowedPaste(), eq(pasteTable.id, record.id), eq(pasteTable.ownerId, record.ownerId)),
      )
      .for("update")
    if (!locked || locked.deletedAt) return false
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
    return true
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

// Whether the viewer may open this paste right now: their own, one shared with them, or one whose
// public link is open to them. Stars never widen that, so they are checked against it when made and when listed.
async function viewerMayRead(
  record: PasteRecord,
  viewer: string | null,
  db: Pick<Database, "select"> = getDb(),
) {
  if (record.deletedAt) return false
  if (record.ownerId === viewer) return true
  if (record.burnAfterRead) return false
  return !recordExpired(record) && (await canOpenLink(record, viewer, db)) === "ok"
}

// Build the readable-star predicate before paging/counting. Only password-protected stars
// with a supplied unlock cookie need a hash lookup; ordinary stars are filtered entirely in SQL.
export async function readableStarsWhere(viewer: string, db: Pick<Database, "select"> = getDb()) {
  const jar = await cookies()
  const cookieSlugs = jar
    .getAll()
    .filter(({ name }) => name.startsWith(unlockCookieName("")))
    .map(({ name }) => name.slice(unlockCookieName("").length))
    .filter((slug) => slug.length > 0 && slug.length <= 40)
  const candidates = cookieSlugs.length
    ? await db
        .select({ id: pasteTable.id, slug: pasteTable.slug, hash: pasteTable.passwordHash })
        .from(pasteTable)
        .innerJoin(pasteStar, eq(pasteStar.pasteId, pasteTable.id))
        .where(
          and(
            eq(pasteStar.userId, viewer),
            inArray(pasteTable.slug, cookieSlugs),
            isNotNull(pasteTable.passwordHash),
          ),
        )
    : []
  const unlocked = (
    await Promise.all(
      candidates.map(async (record) =>
        record.hash &&
        jar.get(unlockCookieName(record.slug))?.value ===
          (await unlockToken(record.slug, record.hash))
          ? record.id
          : null,
      ),
    )
  ).filter((id) => id !== null)
  return and(
    allowedPaste(),
    isNull(pasteTable.deletedAt),
    exists(
      db
        .select({ id: pasteStar.pasteId })
        .from(pasteStar)
        .where(and(eq(pasteStar.userId, viewer), eq(pasteStar.pasteId, pasteTable.id))),
    ),
    or(
      and(allowedPaste(), eq(pasteTable.ownerId, viewer)),
      and(
        eq(pasteTable.burnAfterRead, false),
        or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, new Date())),
        exists(
          db
            .select({ id: pasteShare.pasteId })
            .from(pasteShare)
            .where(
              and(
                eq(pasteShare.userId, viewer),
                and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
                isNull(pasteShare.leftAt),
              ),
            ),
        ),
      ),
      and(
        eq(pasteTable.burnAfterRead, false),
        ne(pasteTable.visibility, "private"),
        or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, new Date())),
        or(
          isNull(pasteTable.passwordHash),
          unlocked.length ? inArray(pasteTable.id, unlocked) : sql`false`,
        ),
      ),
    ),
  )
}

async function starredRecords(viewer: string) {
  return getDb()
    .select()
    .from(pasteTable)
    .where(await readableStarsWhere(viewer))
    .orderBy(desc(pasteTable.updatedAt), pasteTable.id)
}

export async function listStarred() {
  const viewer = await viewerId()
  if (!viewer) return []
  return summarize(await starredRecords(viewer), viewer)
}

export async function isStarred(slug: string) {
  const viewer = await viewerId()
  if (!viewer) return false
  const [row] = await getDb()
    .select({ userId: pasteStar.userId })
    .from(pasteStar)
    .innerJoin(pasteTable, eq(pasteStar.pasteId, pasteTable.id))
    .where(and(eq(pasteStar.userId, viewer), allowedPaste(), eq(pasteTable.slug, slug)))
  return Boolean(row)
}

// Slugs of every paste the viewer has starred, so a list marks its rows with one query.
export async function starredSlugs(slugs?: string[]) {
  const viewer = await viewerId()
  if (!viewer || slugs?.length === 0) return new Set<string>()
  const rows = await getDb()
    .select({ slug: pasteTable.slug })
    .from(pasteStar)
    .innerJoin(pasteTable, eq(pasteStar.pasteId, pasteTable.id))
    .where(
      and(
        allowedPaste(),
        eq(pasteStar.userId, viewer),
        slugs ? inArray(pasteTable.slug, slugs) : undefined,
      ),
    )
  return new Set(rows.map((row) => row.slug))
}

// Pastes the app's screens open for the viewer: their own, and ones shared with them.
function appPasteWhere(slug: string, viewer: string) {
  return and(
    allowedPaste(),
    eq(pasteTable.slug, slug),
    or(
      and(
        and(allowedPaste(), eq(pasteTable.ownerId, viewer)),
        and(allowedPaste(), isNull(pasteTable.deletedAt)),
      ),
      exists(
        getDb()
          .select({ id: pasteShare.pasteId })
          .from(pasteShare)
          .where(
            and(
              and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
              sharedWithWhere(viewer),
            ),
          ),
      ),
    ),
  )
}

// A paste for the app's screens (detail, edit, duplicate): one of the viewer's own, or one shared
// with them. Anyone else's paste, a trashed one and a missing one all come back as null.
export const getPaste = cache(async (slug: string, revisionPage = 1) => {
  const viewer = await viewerId()
  if (!viewer) return null
  const [record] = await getDb().select().from(pasteTable).where(appPasteWhere(slug, viewer))
  if (!record) return null
  return hydrate(record, viewer, revisionPage)
})

// Apply the same app access and moderation rules as the history page.
export async function getComparisonRevisions(slug: string) {
  const viewer = await viewerId()
  if (!viewer) return null
  const [record] = await getDb().select().from(pasteTable).where(appPasteWhere(slug, viewer))
  if (!record) return null
  const rows = await getDb()
    .select({
      id: pasteRevision.id,
      message: pasteRevision.message,
      snapshot: pasteRevision.snapshot,
    })
    .from(pasteRevision)
    .where(
      and(
        allowedParent(pasteRevision.pasteId),
        eq(pasteRevision.pasteId, record.id),
        sql`${pasteRevision.snapshot} is not null`,
      ),
    )
    .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
  return rows
}

// Metadata never needs content, view history or revision rows.
export const getPasteMeta = cache(async (slug: string) => {
  const viewer = await viewerId()
  if (!viewer) return null
  const [row] = await getDb()
    .select({ title: pasteTable.title })
    .from(pasteTable)
    .where(appPasteWhere(slug, viewer))
  return row ?? null
})

export type SharedRead =
  | { status: "ok"; paste: SharedPaste; owned: boolean; signedIn: boolean }
  // A burn-after-read paste before an explicit reveal, for every visitor including its owner.
  | { status: "sealed"; owned: boolean; signedIn: boolean }
  // A password paste before its unlock cookie, for every visitor including its owner.
  | { status: "locked"; owned: boolean; signedIn: boolean }
  | { status: "missing" }

// A live paste (not trashed, not expired) by its link, or null.
async function findLiveRecord(slug: string) {
  const record = await findRecord(slug)
  return record && !record.deletedAt && !recordExpired(record) ? record : null
}

// Memoized per server render, so the share page and its generateMetadata share one lookup. Only
// for reads: a burn claim still re-checks the row in its own UPDATE.
const findSharedRecord = cache(findLiveRecord)

// Whether the visitor may open the paste's public link: its owner and the people it's shared with
// always can; everyone else needs a public or unlisted paste and, if it has one, the password
// (proved by the unlock cookie). `asVisitor` is the share page's rule: the owner opening their
// public or unlisted paste's link is asked for its password like anyone they send it to, so they
// see what those people see. People it's shared with keep skipping it, which is what an invite
// grants. Raw files, print and stars keep the owner's own access.
async function canOpenLink(
  record: PasteRecord,
  viewer: string | null,
  db: Pick<Database, "select"> = getDb(),
  options: { asVisitor?: boolean } = {},
) {
  const owned = record.ownerId === viewer
  if (owned && (record.visibility === "private" || !options.asVisitor)) return "ok" as const
  if (!owned && (await isSharedWith(record, viewer, db))) return "ok" as const
  if (record.visibility === "private") return "missing" as const
  if (record.passwordHash) {
    const cookie = (await cookies()).get(unlockCookieName(record.slug))?.value
    if (cookie !== (await unlockToken(record.slug, record.passwordHash))) return "locked" as const
  }
  return "ok" as const
}

async function claimBurn(tx: Transaction, record: PasteRecord, now: Date, owned: boolean) {
  const [row] = await tx
    .update(pasteTable)
    .set({
      version: sql`${pasteTable.version} + 1`,
      views: sql`${pasteTable.views} + 1`,
      uniqueViews: sql`${pasteTable.uniqueViews} + 1`,
      deletedAt: now,
    })
    .where(eq(pasteTable.id, record.id))
    .returning()
  if (!row) throw new Error("The locked burn paste disappeared.")
  await tx
    .insert(pasteViewDay)
    .values({ pasteId: record.id, day: utcDay(now.getTime()), views: 1 })
    .onConflictDoUpdate({
      target: [pasteViewDay.pasteId, pasteViewDay.day],
      set: { views: sql`${pasteViewDay.views} + 1` },
    })
  // The owner who burns their own paste already knows.
  if (!owned) {
    await recordNotifications(tx, [{ userId: record.ownerId, kind: "burned", pasteId: record.id }])
  }
  return row
}

async function lockSharedRead(tx: Transaction, slug: string) {
  const where = and(allowedPaste(), eq(pasteTable.slug, slug))
  const [ordinary] = await tx
    .select()
    .from(pasteTable)
    .where(and(where, eq(pasteTable.burnAfterRead, false)))
    .for("share")
  if (ordinary) return ordinary
  const [record] = await tx.select().from(pasteTable).where(where).for("update")
  return record ?? null
}

// Load only the public projection, after the caller has authorized and locked the paste.
async function loadSharedPaste(tx: Transaction, record: PasteRecord): Promise<SharedPaste | null> {
  const [files, [author]] = await Promise.all([
    tx
      .select({ name: pasteFile.name, language: pasteFile.language, content: pasteFile.content })
      .from(pasteFile)
      .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
      .orderBy(pasteFile.position, pasteFile.id),
    tx
      .select({ name: user.name, username: user.username, displayUsername: user.displayUsername })
      .from(user)
      .where(eq(user.id, record.ownerId)),
  ])
  if (files.length === 0 || recordExpired(record)) return null
  return {
    slug: record.slug,
    title: record.title,
    files,
    author: pasteAuthor(author),
    updatedAt: ms(record.updatedAt),
    expiresAt: ms(record.expiresAt),
    views: record.views,
    burnAfterRead: record.burnAfterRead,
    allowRaw: record.allowRaw,
  }
}

// Read a share page without ever claiming a burn paste. Burn reads stay sealed for everyone, the
// owner included, as do visits from link previews, scanners and prefetches. Ordinary visits queue
// a view.
export async function readSharedPaste(
  slug: string,
  options: { visit?: boolean } = {},
): Promise<SharedRead> {
  const viewer = await viewerId()
  const result = await getDb().transaction(
    async (tx): Promise<SharedRead & { countedId?: string }> => {
      const record = await lockSharedRead(tx, slug)
      if (!record || record.deletedAt || recordExpired(record)) return { status: "missing" }
      const verdict = await canOpenLink(record, viewer, tx, { asVisitor: true })
      const owned = record.ownerId === viewer
      if (verdict === "locked") return { status: verdict, owned, signedIn: viewer !== null }
      if (verdict !== "ok") return { status: verdict }
      if (record.burnAfterRead) return { status: "sealed", owned, signedIn: viewer !== null }
      const paste = await loadSharedPaste(tx, record)
      if (!paste) return { status: "missing" }
      const counted = Boolean(options.visit && !owned)
      if (counted) {
        const now = new Date()
        await tx
          .insert(pasteVisit)
          .values({ pasteId: record.id, acceptedAt: now, day: utcDay(now.getTime()) })
      }
      return {
        status: "ok",
        paste,
        owned,
        signedIn: viewer !== null,
        ...(counted ? { countedId: record.id } : {}),
      }
    },
  )
  const { countedId, ...read } = result
  if (countedId) await recordPasteEvent(countedId, "view")
  return read
}

// Only the explicit reveal POST uses this operation. Authorization and content loading stay
// inside the row lock, so exactly one reader can claim a live burn-after-read paste. Its owner is
// one of those readers: on the share link a burn applies to everyone, so an owner who wants to
// look without using it up opens it in the app instead.
export async function revealSharedPaste(
  slug: string,
): Promise<Exclude<SharedRead, { status: "sealed" }>> {
  const viewer = await viewerId()
  const result = await getDb().transaction(
    async (tx): Promise<Exclude<SharedRead, { status: "sealed" }> & { countedId?: string }> => {
      const record = await lockSharedRead(tx, slug)
      if (!record || record.deletedAt || recordExpired(record)) return { status: "missing" }
      const verdict = await canOpenLink(record, viewer, tx, { asVisitor: true })
      const owned = record.ownerId === viewer
      if (verdict === "locked") return { status: verdict, owned, signedIn: viewer !== null }
      if (verdict !== "ok") return { status: verdict }
      const paste = await loadSharedPaste(tx, record)
      if (!paste) return { status: "missing" }
      const burn = record.burnAfterRead
      if (burn) paste.views = (await claimBurn(tx, record, new Date(), owned)).views
      return {
        status: "ok",
        paste,
        owned,
        signedIn: viewer !== null,
        ...(burn ? { countedId: record.id } : {}),
      }
    },
  )
  const { countedId, ...read } = result
  if (countedId) await recordPasteEvent(countedId, "view")
  return read
}

function pasteAuthor(
  author: { name: string; username: string | null; displayUsername: string | null } | undefined,
): SharedPaste["author"] {
  return author
    ? {
        name: author.name,
        username: author.displayUsername ?? author.username ?? author.name,
        initials: initials(author.name),
        tone: "foreground",
      }
    : { name: "Unknown", username: "unknown", initials: "?", tone: "muted" }
}

const sharedAccess = cache(async (slug: string) => {
  const record = await findSharedRecord(slug)
  if (!record) return { status: "missing" as const }
  const viewer = await viewerId()
  const verdict = await canOpenLink(record, viewer)
  if (verdict !== "ok") return { status: verdict }
  return { status: "ok" as const, record, viewer, owned: record.ownerId === viewer }
})

export type RawRead =
  | { status: "ok"; file: PasteFile }
  | { status: "missing" }
  | { status: "locked" }
  | { status: "forbidden" }

// Authorize before touching content and load only the requested file (or the first-file fallback).
export async function readRawFile(slug: string, name: string | null): Promise<RawRead> {
  const viewer = await viewerId()
  const result = await getDb().transaction(async (tx): Promise<RawRead & { eventId?: string }> => {
    const record = await lockSharedRead(tx, slug)
    if (!record || record.deletedAt || recordExpired(record)) return { status: "missing" }
    const verdict = await canOpenLink(record, viewer, tx)
    if (verdict !== "ok") return { status: verdict }
    const owned = record.ownerId === viewer
    if (!owned && (record.burnAfterRead || !record.allowRaw)) return { status: "forbidden" }
    const [file] = await tx
      .select({ name: pasteFile.name, language: pasteFile.language, content: pasteFile.content })
      .from(pasteFile)
      .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
      .orderBy(
        name === null ? asc(pasteFile.position) : desc(sql`${pasteFile.name} = ${name}`),
        pasteFile.position,
        pasteFile.id,
      )
      .limit(1)
    if (!file || recordExpired(record)) return { status: "missing" }
    return { status: "ok", file, ...(!owned ? { eventId: record.id } : {}) }
  })
  const { eventId, ...read } = result
  if (eventId) await recordPasteEvent(eventId, "raw")
  return read
}

// A visitor copied a paste's code on the share page. Counted like a view: not for the owner, and
// only for a paste the visitor could open.
export async function recordCopy(slug: string) {
  const access = await sharedAccess(slug)
  if (access.status === "ok" && !access.owned) await recordPasteEvent(access.record.id, "copy")
}

// The share page's title and indexing, without loading files or counting a view. A title is
// content too, so it's null for burn-after-read pastes and for pastes the visitor can't open.
export async function readSharedMeta(slug: string) {
  const access = await sharedAccess(slug)
  if (access.status !== "ok" || access.record.burnAfterRead) return null
  const [metadata] = await getDb()
    .select({ title: pasteTable.title, visibility: pasteTable.visibility })
    .from(pasteTable)
    .where(
      and(
        allowedPaste(),
        eq(pasteTable.id, access.record.id),
        eq(pasteTable.version, access.record.version),
      ),
    )
  return metadata ?? null
}

// Card data for link previews of public and unlisted pastes: whoever has an unlisted link can read
// the paste already, and the unfurler only has the link. It ignores sessions and unlock cookies, so
// even the owner cannot expose a private or protected paste through the unauthenticated image URL.
// No views, events or burn claims.
export async function readPublicPreview(slug: string): Promise<PastePreview | null> {
  const record = await findSharedRecord(slug)
  if (!record || record.visibility === "private" || record.passwordHash || record.burnAfterRead)
    return null
  const [file] = await getDb()
    .select({
      name: pasteFile.name,
      language: pasteFile.language,
      content: sql<string>`left(${pasteFile.content}, 4000)`,
    })
    .from(pasteFile)
    .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
    .orderBy(pasteFile.position, pasteFile.id)
    .limit(1)
  if (!file) return null
  return {
    slug: record.slug,
    title: record.title,
    unlisted: record.visibility === "unlisted",
    ...file,
  }
}

// The embed view runs inside other sites' pages, so like the preview card it ignores sessions and
// unlock cookies: a private, protected or one-time paste never opens there, even for its owner.
// Unlisted pastes do, since whoever has the link may already read them. No views or burn claims.
export async function readEmbedPaste(slug: string): Promise<SharedPaste | null> {
  const record = await findSharedRecord(slug)
  if (!record || record.visibility === "private" || record.passwordHash || record.burnAfterRead)
    return null
  const db = getDb()
  const [files, [author]] = await Promise.all([
    db
      .select({ name: pasteFile.name, language: pasteFile.language, content: pasteFile.content })
      .from(pasteFile)
      .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
      .orderBy(pasteFile.position, pasteFile.id),
    db
      .select({ name: user.name, username: user.username, displayUsername: user.displayUsername })
      .from(user)
      .where(eq(user.id, record.ownerId)),
  ])
  return {
    slug: record.slug,
    title: record.title,
    files,
    author: pasteAuthor(author),
    updatedAt: ms(record.updatedAt),
    expiresAt: ms(record.expiresAt),
    views: record.views,
    burnAfterRead: false,
    allowRaw: record.allowRaw,
  }
}

// Only the owner may send a link to the instance's configured channel. Protected links aren't
// useful to a channel, and a bot must never consume a one-time paste.
export async function readWebhookPaste(slug: string) {
  const record = await findOwned(slug)
  if (
    !record ||
    record.deletedAt ||
    recordExpired(record) ||
    record.visibility === "private" ||
    record.passwordHash ||
    record.burnAfterRead
  )
    return null
  return { slug: record.slug, title: record.title, visibility: record.visibility }
}

// The stored password hash of a paste someone could be asked to unlock, for the unlock route.
export async function getUnlockHash(slug: string) {
  const record = await findLiveRecord(slug)
  return record && record.visibility !== "private" ? record.passwordHash : null
}

async function sharedCount(viewer: string) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(pasteShare)
    .innerJoin(
      pasteTable,
      and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
    )
    .where(sharedWithWhere(viewer))
  return row?.count ?? 0
}

export async function navCounts(): Promise<NavCounts> {
  const viewer = await viewerId()
  if (!viewer) return { pastes: 0, starred: 0, shared: 0 }
  const db = getDb()
  const stars = await readableStarsWhere(viewer)
  const [[own], [starred], shared] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pasteTable)
      .where(and(allowedPaste(), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))),
    db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(stars),
    sharedCount(viewer),
  ])
  return { pastes: own?.count ?? 0, starred: starred?.count ?? 0, shared }
}

// The order a sidebar section lists its pastes in, from its filter menu.
function sidebarOrder(sort: PasteSectionView["sort"]) {
  if (sort === "views") return [desc(pasteTable.views), desc(pasteTable.updatedAt), pasteTable.id]
  if (sort === "title") return [asc(sql`lower(${pasteTable.title})`), pasteTable.id]
  return [desc(pasteTable.updatedAt), pasteTable.id]
}

function sidebarVisibility(visibility: PasteSectionView["visibility"]) {
  return visibility === "all" ? undefined : eq(pasteTable.visibility, visibility)
}

// The sidebar's sections. `views` holds each section's filter, sort and length from the sidebar
// cookie; the counts for "View all" stay unfiltered.
export const sidebarData = cache(
  async (views: SidebarViews = defaultSidebarViews): Promise<SidebarData> => {
    const viewer = await viewerId()
    if (!viewer) return { counts: { pastes: 0, starred: 0, shared: 0 }, recent: [], starred: [] }
    const db = getDb()
    const stars = await readableStarsWhere(viewer)
    const [[own], [starCount], recent, starred, shared] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(pasteTable)
        .where(and(allowedPaste(), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))),
      db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(stars),
      db
        .select()
        .from(pasteTable)
        .where(
          and(
            allowedPaste(),
            eq(pasteTable.ownerId, viewer),
            isNull(pasteTable.deletedAt),
            sidebarVisibility(views.pastes.visibility),
          ),
        )
        .orderBy(...sidebarOrder(views.pastes.sort))
        .limit(views.pastes.limit),
      db
        .select()
        .from(pasteTable)
        .where(and(stars, sidebarVisibility(views.starred.visibility)))
        .orderBy(...sidebarOrder(views.starred.sort))
        .limit(views.starred.limit),
      sharedCount(viewer),
    ])
    const starSlugs = await starredSlugs([...recent, ...starred].map((record) => record.slug))
    const row = (record: PasteRecord) => ({
      slug: record.slug,
      title: record.title,
      owned: record.ownerId === viewer,
      starred: starSlugs.has(record.slug),
      collection: record.ownerId === viewer ? record.collection : null,
      updatedAt: record.updatedAt.getTime(),
    })
    return {
      counts: { pastes: own?.count ?? 0, starred: starCount?.count ?? 0, shared },
      recent: recent.map(row),
      starred: starred.map(row),
    }
  },
)

// The command menu's paste search: the viewer's own pastes whose title or slug contains the text,
// latest first. File contents are never searched.
export async function searchOwnPastes(
  text: string,
  limit = PASTE_SEARCH_LIMIT,
): Promise<PasteSearchResult> {
  const viewer = await viewerId()
  const query = text.trim().slice(0, PASTE_SEARCH_MAX_LENGTH)
  if (!viewer || !query) return { hits: [], total: 0 }
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`
  const where = and(
    allowedPaste(),
    eq(pasteTable.ownerId, viewer),
    isNull(pasteTable.deletedAt),
    or(ilike(pasteTable.title, pattern), ilike(pasteTable.slug, pattern)),
  )
  const db = getDb()
  const [rows, [count]] = await Promise.all([
    db
      .select({ slug: pasteTable.slug, title: pasteTable.title, updatedAt: pasteTable.updatedAt })
      .from(pasteTable)
      .where(where)
      .orderBy(desc(pasteTable.updatedAt), pasteTable.id)
      .limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(where),
  ])
  return {
    hits: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.getTime() })),
    total: count?.count ?? 0,
  }
}

// The dashboard can hydrate its bounded recent selections without exposing the SQL layer.
export async function summarizePastes(
  records: PasteRecord[],
  viewer: string,
  db: Pick<Database, "select"> = getDb(),
) {
  return summarize(records, viewer, false, db)
}

export async function isSlugAvailable(slug: string, except?: string) {
  if (!SLUG_PATTERN.test(slug)) return false
  return slug === except || !(await findRecord(slug, true))
}

export async function createPaste(input: PasteInput, invites: ShareInvite[] = []) {
  const data = parsePasteInput(input)
  const actor = { kind: "session", userId: await requireViewerId() } as const
  const passwordHash = data.password ? await hashPassword(data.password) : null
  const saved = await getDb().transaction((tx) =>
    createPasteRecord(tx, { kind: "editor", actor, input: data, passwordHash, invites }),
  )
  return { slug: saved.slug }
}

export async function updatePaste(
  slug: string,
  input: PasteInput,
  message: string,
  options: UpdateOptions = {},
): Promise<UpdateResult | null> {
  const data = parsePasteInput(input)
  const actor = { kind: "session", userId: await requireViewerId() } as const
  const passwordHash = data.password ? await hashPassword(data.password) : null
  const result = await getDb().transaction((tx) =>
    replacePaste(
      tx,
      { slug },
      { kind: "editor", actor, input: data, passwordHash, message, options },
    ),
  )
  if (!result || "conflict" in result) return result
  return {
    slug: result.slug,
    version: result.version,
    expiresAt: result.expiresAt,
    hasPassword: result.hasPassword,
  }
}

export async function sealRevision(slug: string, message: string): Promise<boolean> {
  const actor = { kind: "session", userId: await requireViewerId() } as const
  return getDb().transaction((tx) => sealPasteRevision(tx, actor, { slug }, message))
}

export async function restoreRevision(slug: string, revisionId: number): Promise<RestoreResult> {
  const actor = { kind: "session", userId: await requireViewerId() } as const
  return getDb().transaction((tx) => restorePasteRevision(tx, actor, { slug }, revisionId))
}

export async function updateSharing(slug: string, input: SharingInput) {
  const actor = { kind: "session", userId: await requireViewerId() } as const
  const result = await getDb().transaction((tx) => changePasteSharing(tx, actor, { slug }, input))
  return result ? { slug: result.slug } : null
}

export async function setStarred(slug: string, starred: boolean) {
  const viewer = await requireViewerId()
  const record = await findRecord(slug)
  if (!record) return

  const db = getDb()
  if (starred) {
    // Starring a paste you can't open would put its title in your list. Quietly do nothing, as
    // for a paste that doesn't exist. Taking a star off is always allowed.
    if (!(await viewerMayRead(record, viewer))) return
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(pasteTable)
        .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
        .for("update")
      if (!locked || !(await viewerMayRead(locked, viewer, tx))) return
      await tx
        .insert(pasteStar)
        .values({ userId: viewer, pasteId: record.id })
        .onConflictDoNothing()
    })
  } else {
    await db
      .delete(pasteStar)
      .where(and(eq(pasteStar.userId, viewer), eq(pasteStar.pasteId, record.id)))
  }
}

// Changes only the title; the paste keeps its place in the "recent" order.
export async function renamePaste(slug: string, title: string) {
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return
  await getDb()
    .update(pasteTable)
    .set({ title, version: sql`${pasteTable.version} + 1` })
    .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
}

// Files the paste in a collection, or takes it out of its collection with null. The caller
// checks that the collection exists.
export async function setPasteCollection(slug: string, collection: string | null) {
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return
  await getDb()
    .update(pasteTable)
    .set({ collection, version: sql`${pasteTable.version} + 1` })
    .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
}

export async function trashPaste(slug: string) {
  const actor = { kind: "session", userId: await requireViewerId() } as const
  await getDb().transaction((tx) => trashPasteRecord(tx, actor, { slug }))
}

// False when the paste is gone for good (or was never the viewer's), so Undo can say so.
export async function restorePaste(slug: string) {
  const record = await findOwned(slug)
  if (!record) return false
  const changed = await getDb()
    .update(pasteTable)
    .set({ deletedAt: null, version: sql`${pasteTable.version} + 1` })
    .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
    .returning({ id: pasteTable.id })
  return changed.length > 0
}

export async function deleteForever(slug: string) {
  const record = await findOwned(slug, true)
  if (!record?.deletedAt) return
  await getDb().delete(pasteTable).where(eq(pasteTable.id, record.id))
}

export async function emptyTrash() {
  const viewer = await requireViewerId()
  await getDb()
    .delete(pasteTable)
    .where(and(eq(pasteTable.ownerId, viewer), isNotNull(pasteTable.deletedAt)))
}
