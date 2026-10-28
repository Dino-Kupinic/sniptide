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
  lte,
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
import { enforceBudget, lockAccount, PasteBudgetError } from "./budget"
import { isLargeEdit } from "./edit-size"
import { recordPasteEvent } from "./events"
import { insertPaste } from "./insert"
import { hashPassword } from "./passwords"
import type { PastePreview } from "./preview"
import { TRASH_DAYS } from "./purge"
import { pruneSnapshots, snapshotOf } from "./snapshot"

export { PasteBudgetError } from "./budget"

import { parsePasteInput } from "./schema"
import type {
  Access,
  Expiry,
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

const EXPIRY_MS: Record<Exclude<Expiry, "never">, number> = {
  "1h": 3_600_000,
  "1d": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
  "1y": 365 * DAY,
}

// Paths the app already uses, so a custom link can't shadow a page.
const RESERVED = new Set([
  "analytics",
  "api",
  "collections",
  "dashboard",
  "demo",
  "dev",
  "docs",
  "forgot-password",
  "new",
  "pastes",
  "reset-password",
  "secrets",
  "secret-share",
  "settings",
  "shared",
  "sign-in",
  "sign-up",
  "starred",
  "trash",
  "raw",
  "_next",
  "_site",
])

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,40}$/

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

function at(time: number | null) {
  return time === null ? null : new Date(time)
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

export function expiresAtFor(expiry: Expiry, from = Date.now()) {
  return expiry === "never" ? null : from + EXPIRY_MS[expiry]
}

function resolveExpiry(expiry: Expiry | "keep", current: Date | null, from: number) {
  return expiry === "keep" ? current : at(expiresAtFor(expiry, from))
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
  // A burn-after-read paste someone else owns, before they ask for it with `reveal`.
  | { status: "sealed"; signedIn: boolean }
  | { status: "locked" }
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
// (proved by the unlock cookie).
async function canOpenLink(
  record: PasteRecord,
  viewer: string | null,
  db: Pick<Database, "select"> = getDb(),
) {
  if (record.ownerId === viewer) return "ok" as const
  if (await isSharedWith(record, viewer, db)) return "ok" as const
  if (record.visibility === "private") return "missing" as const
  if (record.passwordHash) {
    const cookie = (await cookies()).get(unlockCookieName(record.slug))?.value
    if (cookie !== (await unlockToken(record.slug, record.passwordHash))) return "locked" as const
  }
  return "ok" as const
}

async function claimBurn(tx: Transaction, record: PasteRecord, now: Date) {
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
  await recordNotifications(tx, [{ userId: record.ownerId, kind: "burned", pasteId: record.id }])
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

// A paste by its public link (the share page and its raw files). Returns the content only when
// the visitor may see it. `visit` marks the share page opening it, which counts a view for anyone
// but the owner.
//
// A burn-after-read paste comes back "sealed" to everyone but its owner unless `reveal` is set,
// which only the reveal route does, on an explicit POST from the visitor. Link previews, mail
// scanners and prefetches only ever GET the page, so they can't use it up. Revealing counts the
// view and burns the paste; a visitor who loses that race gets "missing" instead of a copy.
export async function readSharedPaste(
  slug: string,
  options: { visit?: boolean; reveal?: boolean } = {},
): Promise<SharedRead> {
  const viewer = await viewerId()
  const result = await getDb().transaction(
    async (tx): Promise<SharedRead & { countedId?: string }> => {
      const found = await lockSharedRead(tx, slug)
      if (!found || found.deletedAt || recordExpired(found)) return { status: "missing" }
      const verdict = await canOpenLink(found, viewer, tx)
      if (verdict !== "ok") return { status: verdict }
      const owned = found.ownerId === viewer
      const sealed = found.burnAfterRead && !owned
      if (sealed && !options.reveal) return { status: "sealed", signedIn: viewer !== null }
      const counted = Boolean((sealed || options.visit) && !owned)
      const [files, [author]] = await Promise.all([
        tx
          .select({
            name: pasteFile.name,
            language: pasteFile.language,
            content: pasteFile.content,
          })
          .from(pasteFile)
          .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, found.id)))
          .orderBy(pasteFile.position, pasteFile.id),
        tx
          .select({
            name: user.name,
            username: user.username,
            displayUsername: user.displayUsername,
          })
          .from(user)
          .where(eq(user.id, found.ownerId)),
      ])
      if (files.length === 0 || recordExpired(found)) return { status: "missing" }
      const now = new Date()
      const record = sealed ? await claimBurn(tx, found, now) : found
      if (counted && !sealed) {
        await tx
          .insert(pasteVisit)
          .values({ pasteId: record.id, acceptedAt: now, day: utcDay(now.getTime()) })
      }
      return {
        status: "ok",
        paste: {
          slug: record.slug,
          title: record.title,
          files,
          author: pasteAuthor(author),
          updatedAt: ms(record.updatedAt),
          expiresAt: ms(record.expiresAt),
          views: record.views,
          burnAfterRead: record.burnAfterRead,
          allowRaw: record.allowRaw,
        },
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
  if (!SLUG_PATTERN.test(slug) || RESERVED.has(slug.toLowerCase())) return false
  return slug === except || !(await findRecord(slug, true))
}

export function randomSlug() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  let slug: string
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    slug = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
  } while (RESERVED.has(slug.toLowerCase()))
  return slug
}

function fileRows(pasteId: string, files: PasteInput["files"]) {
  return files.map((file, position) => ({ pasteId, position, ...file }))
}

// Creates a paste and shares it with `invites`, people the editor already looked up. Invites of
// the owner or of accounts that no longer exist are dropped.
export async function createPaste(input: PasteInput, invites: ShareInvite[] = []) {
  const data = parsePasteInput(input)
  const owner = await requireViewerId()
  let slug = data.slug
  if (!slug) {
    do slug = randomSlug()
    while (await findRecord(slug, true))
  }

  const now = new Date()
  const id = crypto.randomUUID()
  const passwordHash = data.password ? await hashPassword(data.password) : null
  const bytes = data.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
  await getDb().transaction(async (tx) => {
    await enforceBudget(tx, owner, bytes)
    await insertPaste(tx, {
      id,
      slug,
      ownerId: owner,
      title: data.title,
      description: data.description,
      bytes,
      visibility: data.visibility,
      passwordHash,
      burnAfterRead: data.burnAfterRead,
      collection: data.collection,
      files: data.files,
      createdAt: now,
      expiresAt: resolveExpiry(data.expiry, null, now.getTime()),
    })
    const wanted = new Map(
      invites.filter((invite) => invite.userId !== owner).map((i) => [i.userId, i.access]),
    )
    if (wanted.size === 0) return
    const people = await tx
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, [...wanted.keys()]))
    if (people.length === 0) return
    await tx.insert(pasteShare).values(
      people.map((person) => ({
        pasteId: id,
        userId: person.id,
        access: wanted.get(person.id) ?? "view",
        createdAt: now,
      })),
    )
  })

  return { slug }
}

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]

async function lockEditable(
  tx: Transaction,
  identity: Pick<PasteRecord, "id" | "ownerId">,
  viewer: string,
) {
  await lockAccount(tx, identity.ownerId)
  const [record] = await tx
    .select()
    .from(pasteTable)
    .where(and(allowedPaste(), eq(pasteTable.id, identity.id)))
    .for("update")
  if (!record || record.deletedAt) return null
  if (record.ownerId === viewer) return { record, owned: true }
  if (recordExpired(record) || record.burnAfterRead) return null
  const [share] = await tx
    .select({ access: pasteShare.access })
    .from(pasteShare)
    .where(
      and(
        and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, record.id)),
        eq(pasteShare.userId, viewer),
        isNull(pasteShare.leftAt),
      ),
    )
  return share?.access === "edit" ? { record, owned: false } : null
}

// Revisions made by editing are batched: while the newest revision has the same message, is
// less than this old and wasn't closed with Done, another edit folds into it instead of adding a
// row. A save that rewrites most of the paste (see isLargeEdit) still gets a row of its own.
// Auto-save would otherwise fill the history with one entry per pause in typing.
export const REVISION_WINDOW_MS = 10 * 60_000

export interface UpdateOptions {
  // Only save if the paste is still at this version, so an edit made from a stale
  // copy can't silently overwrite a newer one.
  expectedVersion?: number
  // Fold the edit into the latest revision when it is recent (see REVISION_WINDOW_MS).
  batchRevision?: boolean
}

export type UpdateResult =
  | {
      slug: string
      // The paste's new version: pass it as `expectedVersion` on the next save.
      version: number
      expiresAt: number | null
      hasPassword: boolean
    }
  // `slug` is where the paste lives now, in case the newer save moved it.
  | { conflict: true; version: number; slug: string }

// Saves an edit. Someone the paste is shared with changes only its title, description and files;
// its link, visibility, expiry, password, collection and burn setting stay the owner's.
export async function updatePaste(
  slug: string,
  input: PasteInput,
  message: string,
  options: UpdateOptions = {},
): Promise<UpdateResult | null> {
  const parsed = parsePasteInput(input)
  const viewer = await requireViewerId()
  const identity = await findRecord(slug)
  if (!identity) return null
  const replacementHash =
    identity.ownerId === viewer && parsed.password ? await hashPassword(parsed.password) : null
  return getDb().transaction(async (tx): Promise<UpdateResult | null> => {
    const editable = await lockEditable(tx, identity, viewer)
    if (!editable) return null
    const { record, owned } = editable
    const data = parsed
    const now = new Date()
    const passwordHash = owned && data.password !== "" ? replacementHash : record.passwordHash
    const expiresAt = owned
      ? resolveExpiry(data.expiry, record.expiresAt, now.getTime())
      : record.expiresAt
    const nextSlug = owned ? data.slug || record.slug : record.slug
    const stamp = new Date(Math.max(now.getTime(), record.updatedAt.getTime() + 1))
    const bytes = data.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
    await enforceBudget(tx, record.ownerId, bytes, record.id)
    const changed = await tx
      .update(pasteTable)
      .set({
        bytes,
        title: data.title,
        description: data.description,
        ...(owned
          ? {
              slug: nextSlug,
              visibility: data.visibility,
              passwordHash,
              burnAfterRead: data.burnAfterRead,
              collection: data.collection,
              expiresAt,
            }
          : {}),
        updatedAt: stamp,
        version: sql`${pasteTable.version} + 1`,
      })
      .where(
        and(
          allowedPaste(),
          eq(pasteTable.id, record.id),
          options.expectedVersion === undefined
            ? undefined
            : eq(pasteTable.version, options.expectedVersion),
        ),
      )
      .returning({ version: pasteTable.version })
    if (!changed[0]) {
      const [latest] = await tx
        .select({ version: pasteTable.version, slug: pasteTable.slug })
        .from(pasteTable)
        .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
      if (!latest) return null
      return {
        conflict: true,
        version: latest?.version ?? record.version,
        slug: latest?.slug ?? record.slug,
      }
    }

    // Read before they are replaced, to tell a small edit from a rewrite.
    const before = options.batchRevision
      ? await tx
          .select({ name: pasteFile.name, content: pasteFile.content })
          .from(pasteFile)
          .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
      : []
    await tx
      .delete(pasteFile)
      .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
    await tx.insert(pasteFile).values(fileRows(record.id, data.files))

    const [latest] = options.batchRevision
      ? await tx
          .select()
          .from(pasteRevision)
          .where(and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)))
          .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
          .limit(1)
      : []
    const batched =
      latest?.message === message &&
      !latest.sealed &&
      now.getTime() - latest.createdAt.getTime() < REVISION_WINDOW_MS &&
      !isLargeEdit(before, data.files)
    const snapshot = snapshotOf(data, data.files)
    if (batched && latest) {
      // The revision stands for the state the batch ended in.
      await tx.update(pasteRevision).set({ snapshot }).where(eq(pasteRevision.id, latest.id))
    } else {
      await tx
        .insert(pasteRevision)
        .values({ pasteId: record.id, message, snapshot, createdAt: stamp })
      await pruneSnapshots(tx, record.id)
    }

    return {
      slug: nextSlug,
      version: changed[0].version,
      expiresAt: ms(expiresAt),
      hasPassword: passwordHash !== null,
    }
  })
}

// Closes the editing session: the next edit starts a new revision. Only the revision made by
// auto-save is closed; one made another way (created, imported, restored) is left alone.
export async function sealRevision(slug: string, message: string): Promise<boolean> {
  const viewer = await requireViewerId()
  const identity = await findRecord(slug)
  if (!identity) return false
  return getDb().transaction(async (tx) => {
    const editable = await lockEditable(tx, identity, viewer)
    if (!editable) return false
    const [latest] = await tx
      .select({ id: pasteRevision.id, message: pasteRevision.message })
      .from(pasteRevision)
      .where(eq(pasteRevision.pasteId, editable.record.id))
      .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
      .limit(1)
    if (latest?.message === message) {
      await tx.update(pasteRevision).set({ sealed: true }).where(eq(pasteRevision.id, latest.id))
    }
    return true
  })
}

export type RestoreResult =
  | { ok: true; slug: string; version: number }
  | { ok: false; error: string }

// Rolls the title, description and files back to how a revision left them. The sharing settings,
// the link and the collection stay as they are. The rollback is a revision of its own, so the
// version it replaced is still in the history and can be restored in turn.
export async function restoreRevision(slug: string, revisionId: number): Promise<RestoreResult> {
  const viewer = await requireViewerId()
  const identity = await findRecord(slug)
  if (!identity) return { ok: false, error: "That paste no longer exists." }

  return getDb().transaction(async (tx): Promise<RestoreResult> => {
    const editable = await lockEditable(tx, identity, viewer)
    if (!editable) return { ok: false, error: "That paste no longer exists." }
    const { record } = editable

    const [target] = await tx
      .select()
      .from(pasteRevision)
      .where(
        and(
          eq(pasteRevision.id, revisionId),
          and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)),
        ),
      )
    const snapshot = target?.snapshot
    if (!target || !snapshot || snapshot.files.length === 0) {
      return { ok: false, error: "That version can't be restored." }
    }

    const [newest] = await tx
      .select({ id: pasteRevision.id })
      .from(pasteRevision)
      .where(and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)))
      .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
      .limit(1)
    if (newest?.id === target.id) return { ok: false, error: "That is the current version." }

    const [position] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(pasteRevision)
      .where(
        and(
          and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)),
          or(
            lt(pasteRevision.createdAt, target.createdAt),
            and(eq(pasteRevision.createdAt, target.createdAt), lte(pasteRevision.id, target.id)),
          ),
        ),
      )

    const bytes = snapshot.files.reduce(
      (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
      0,
    )
    try {
      await enforceBudget(tx, record.ownerId, bytes, record.id)
    } catch (error) {
      if (error instanceof PasteBudgetError) return { ok: false, error: error.message }
      throw error
    }

    const version = record.version + 1
    const stamp = new Date(Math.max(Date.now(), record.updatedAt.getTime() + 1))
    await tx
      .update(pasteTable)
      .set({
        title: snapshot.title,
        description: snapshot.description,
        bytes,
        updatedAt: stamp,
        version: sql`${pasteTable.version} + 1`,
      })
      .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
    await tx
      .delete(pasteFile)
      .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
    await tx.insert(pasteFile).values(
      snapshot.files.map((file, index) => ({
        pasteId: record.id,
        position: index,
        name: file.name,
        language: file.language,
        content: file.content,
        startLine: file.startLine ?? null,
        endLine: file.endLine ?? null,
      })),
    )
    await tx.insert(pasteRevision).values({
      pasteId: record.id,
      message: `Restored revision ${position?.count ?? 0}`,
      snapshot,
      createdAt: stamp,
    })
    await pruneSnapshots(tx, record.id)
    return { ok: true, slug: record.slug, version }
  })
}

export async function updateSharing(slug: string, input: SharingInput) {
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return null

  const { expiry, password, ...rest } = input
  const changed = await getDb()
    .update(pasteTable)
    .set({
      ...rest,
      version: sql`${pasteTable.version} + 1`,
      ...(password !== undefined
        ? { passwordHash: password ? await hashPassword(password) : null }
        : {}),
      ...(expiry ? { expiresAt: at(expiresAtFor(expiry)) } : {}),
    })
    .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
    .returning({ id: pasteTable.id })
  return changed.length ? { slug } : null
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
  const record = await findOwned(slug, true)
  if (!record) return
  await getDb()
    .update(pasteTable)
    .set({ deletedAt: new Date(), version: sql`${pasteTable.version} + 1` })
    .where(eq(pasteTable.id, record.id))
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
