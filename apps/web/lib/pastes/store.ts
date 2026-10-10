import "server-only"

import {
  pasteFile,
  pasteRevision,
  pasteStar,
  paste as pasteTable,
  pasteViewDay,
  user,
} from "@workspace/db/schema"
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
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
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { initials } from "@/lib/format"
import { DAY } from "@/lib/time"
import { enforceBudget } from "./budget"
import { hashPassword } from "./passwords"
import { TRASH_DAYS } from "./purge"

export { PasteBudgetError } from "./budget"

import { parsePasteInput } from "./schema"
import type {
  Expiry,
  NavCounts,
  Paste,
  PasteFile,
  PasteInput,
  PasteSummary,
  Person,
  Share,
  SharedPaste,
  SharingInput,
  SidebarData,
} from "./types"
import { SIDEBAR_RECENT, SIDEBAR_STARRED } from "./types"
import { unlockCookieName, unlockToken } from "./unlock"

// Pastes in Postgres (packages/db/src/schema/pastes.ts). Every paste belongs to one account; the
// signed-in viewer sees their own pastes in the app, and anyone can open a paste's public link
// (subject to visibility, password and expiry).
//
// Content readers authorize before loading files: `getOwnPaste` for app screens,
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
}

// Paths the app already uses, so a custom link can't shadow a page.
const RESERVED = new Set([
  "api",
  "collections",
  "dashboard",
  "new",
  "pastes",
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

// Turns paste rows into the summaries the lists read: view history, authors, and each paste's
// first language and total size, in one query each. File contents and revisions stay unloaded.
async function summarize(
  records: PasteRecord[],
  viewer: string | null,
  withHistory = false,
): Promise<PasteSummary[]> {
  if (records.length === 0) return []
  const db = getDb()
  const ids = records.map((record) => record.id)
  const today = utcDay(Date.now())
  const firstDay = today - VIEW_HISTORY_DAYS + 1

  const [files, days, authors] = await Promise.all([
    db
      .select({
        pasteId: pasteFile.pasteId,
        language: pasteFile.language,
        bytes: sql<number>`octet_length(${pasteFile.content})::int`,
      })
      .from(pasteFile)
      .where(inArray(pasteFile.pasteId, ids))
      .orderBy(pasteFile.position),
    withHistory
      ? db
          .select()
          .from(pasteViewDay)
          .where(
            and(
              inArray(pasteViewDay.pasteId, ids),
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

  const fileSummaries = new Map<string, { language: string; bytes: number }>()
  for (const file of files) {
    const summary = fileSummaries.get(file.pasteId)
    if (summary) summary.bytes += file.bytes
    else fileSummaries.set(file.pasteId, { language: file.language, bytes: file.bytes })
  }
  const history = new Map<string, number[]>()
  for (const day of days) {
    let series = history.get(day.pasteId)
    if (!series) {
      series = Array<number>(VIEW_HISTORY_DAYS).fill(0)
      history.set(day.pasteId, series)
    }
    series[day.day - firstDay] = day.views
  }
  return records.map((record) => {
    const viewsByDay = withHistory
      ? (history.get(record.id) ?? Array<number>(VIEW_HISTORY_DAYS).fill(0))
      : []
    const author = people.get(record.ownerId) ?? {
      username: "unknown",
      name: "Unknown",
      initials: "?",
      tone: "muted",
    }
    const own = fileSummaries.get(record.id)

    return {
      slug: record.slug,
      title: record.title,
      description: record.description,
      language: own?.language ?? "text",
      bytes: own?.bytes ?? 0,
      visibility: record.visibility,
      password: record.passwordHash,
      burnAfterRead: record.burnAfterRead,
      allowRaw: record.allowRaw,
      collection: record.collection,
      owner: record.ownerId === viewer ? null : author,
      author,
      views: record.views,
      uniqueViews: record.uniqueViews,
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
  const [revisionTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pasteRevision)
    .where(eq(pasteRevision.pasteId, record.id))
  const revisionCount = revisionTotal?.count ?? 0
  const revisionPageCount = Math.max(1, Math.ceil(revisionCount / 20))
  const revisionPage = Math.min(Math.max(1, requestedRevisionPage), revisionPageCount)
  const [[summary], files, revisions] = await Promise.all([
    summarize([record], viewer, true),
    db.select().from(pasteFile).where(eq(pasteFile.pasteId, record.id)).orderBy(pasteFile.position),
    db
      .select()
      .from(pasteRevision)
      .where(eq(pasteRevision.pasteId, record.id))
      .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
      .limit(20)
      .offset((revisionPage - 1) * 20),
  ])
  if (!summary) return null

  return {
    ...summary,
    revisionCount,
    revisionPage,
    revisionPageCount,
    files: files.map(({ name, language, content }) => ({ name, language, content })),
    revisions: revisions.map(({ message, createdAt }) => ({ message, createdAt: ms(createdAt) })),
  }
}

async function findRecord(slug: string) {
  const [record] = await getDb().select().from(pasteTable).where(eq(pasteTable.slug, slug))
  return record ?? null
}

// A paste the viewer owns, trashed or not.
async function findOwned(slug: string) {
  const viewer = await requireViewerId()
  const record = await findRecord(slug)
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
    .where(and(eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt)))
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
        eq(pasteTable.ownerId, viewer),
        sql`${pasteTable.deletedAt} >= ${new Date(Date.now() - TRASH_DAYS * DAY).toISOString()}`,
      ),
    )
    .orderBy(desc(pasteTable.deletedAt))
  return summarize(records, viewer)
}

// Sharing pastes with other accounts isn't built yet; "Shared with me" stays empty until then.
export async function listShared(): Promise<
  { share: Share & { seen: boolean }; paste: PasteSummary }[]
> {
  return []
}

export async function getShare(_slug: string): Promise<(Share & { seen: boolean }) | null> {
  return null
}

export async function markShareSeen(_slug: string) {}

// Whether the viewer may open this paste right now: their own, or one whose public link is open
// to them. Stars never widen that, so they are checked against it when made and when listed.
async function viewerMayRead(record: PasteRecord, viewer: string | null) {
  if (record.deletedAt) return false
  if (record.ownerId === viewer) return true
  return !recordExpired(record) && (await canOpenLink(record, viewer)) === "ok"
}

// Build the readable-star predicate before paging/counting. Only password-protected stars
// with a supplied unlock cookie need a hash lookup; ordinary stars are filtered entirely in SQL.
export async function readableStarsWhere(viewer: string) {
  const jar = await cookies()
  const cookieSlugs = jar
    .getAll()
    .filter(({ name }) => name.startsWith(unlockCookieName("")))
    .map(({ name }) => name.slice(unlockCookieName("").length))
    .filter((slug) => slug.length > 0 && slug.length <= 40)
  const candidates = cookieSlugs.length
    ? await getDb()
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
    isNull(pasteTable.deletedAt),
    exists(
      getDb()
        .select({ id: pasteStar.pasteId })
        .from(pasteStar)
        .where(and(eq(pasteStar.userId, viewer), eq(pasteStar.pasteId, pasteTable.id))),
    ),
    or(
      eq(pasteTable.ownerId, viewer),
      and(
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
    .where(and(eq(pasteStar.userId, viewer), eq(pasteTable.slug, slug)))
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
    .where(and(eq(pasteStar.userId, viewer), slugs ? inArray(pasteTable.slug, slugs) : undefined))
  return new Set(rows.map((row) => row.slug))
}

// One of the viewer's own pastes, for the app's screens (detail, edit, duplicate). Anyone else's
// paste, a trashed one and a missing one all come back as null.
export const getOwnPaste = cache(async (slug: string, revisionPage = 1) => {
  const viewer = await viewerId()
  if (!viewer) return null
  const [record] = await getDb()
    .select()
    .from(pasteTable)
    .where(
      and(eq(pasteTable.slug, slug), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt)),
    )
  if (!record) return null
  return hydrate(record, viewer, revisionPage)
})

// Metadata never needs content, view history or revision rows.
export const getOwnMeta = cache(async (slug: string) => {
  const owner = await viewerId()
  if (!owner) return null
  const [row] = await getDb()
    .select({ title: pasteTable.title })
    .from(pasteTable)
    .where(
      and(eq(pasteTable.slug, slug), eq(pasteTable.ownerId, owner), isNull(pasteTable.deletedAt)),
    )
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

// Whether the visitor may open the paste's public link: its owner always can; everyone else needs
// a public or unlisted paste and, if it has one, the password (proved by the unlock cookie).
async function canOpenLink(record: PasteRecord, viewer: string | null) {
  if (record.ownerId === viewer) return "ok" as const
  if (record.visibility === "private") return "missing" as const
  if (record.passwordHash) {
    const cookie = (await cookies()).get(unlockCookieName(record.slug))?.value
    if (cookie !== (await unlockToken(record.slug, record.passwordHash))) return "locked" as const
  }
  return "ok" as const
}

// Counts a visit from the public page and, for a burn-after-read paste, claims it: the first
// visitor's UPDATE moves it to the trash and every other concurrent one matches no row, so only
// one reader ever gets the content. Returns the updated row, or null when this visit lost.
//
// A burned paste sits in the owner's trash, where they can restore it, until the trash purge
// removes it after TRASH_DAYS. It stays out of reach of every public read in the meantime.
async function claimVisit(id: string) {
  const now = new Date()
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(pasteTable)
      .set({
        views: sql`${pasteTable.views} + 1`,
        uniqueViews: sql`${pasteTable.uniqueViews} + 1`,
        deletedAt: sql`CASE WHEN ${pasteTable.burnAfterRead} THEN ${now.toISOString()}::timestamptz ELSE ${pasteTable.deletedAt} END`,
      })
      .where(
        and(
          eq(pasteTable.id, id),
          isNull(pasteTable.deletedAt),
          or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, now)),
        ),
      )
      .returning()
    if (!row) return null

    await tx
      .insert(pasteViewDay)
      .values({ pasteId: id, day: utcDay(now.getTime()), views: 1 })
      .onConflictDoUpdate({
        target: [pasteViewDay.pasteId, pasteViewDay.day],
        set: { views: sql`${pasteViewDay.views} + 1` },
      })
    return row
  })
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
  const access = await sharedAccess(slug)
  if (access.status !== "ok") return access
  const { record: found, owned, viewer } = access
  const sealed = found.burnAfterRead && !owned
  if (sealed && !options.reveal) return { status: "sealed", signedIn: viewer !== null }
  const record = (sealed || options.visit) && !owned ? await claimVisit(found.id) : found
  if (!record) return { status: "missing" }

  const db = getDb()
  const [files, [author]] = await Promise.all([
    db
      .select({ name: pasteFile.name, language: pasteFile.language, content: pasteFile.content })
      .from(pasteFile)
      .where(eq(pasteFile.pasteId, record.id))
      .orderBy(pasteFile.position, pasteFile.id),
    db
      .select({ name: user.name, username: user.username, displayUsername: user.displayUsername })
      .from(user)
      .where(eq(user.id, record.ownerId)),
  ])
  const paste: SharedPaste = {
    slug: record.slug,
    title: record.title,
    files,
    author: author
      ? {
          name: author.name,
          username: author.displayUsername ?? author.username ?? author.name,
          initials: initials(author.name),
          tone: "foreground",
        }
      : { name: "Unknown", username: "unknown", initials: "?", tone: "muted" },
    updatedAt: ms(record.updatedAt),
    expiresAt: ms(record.expiresAt),
    views: record.views,
    burnAfterRead: record.burnAfterRead,
    allowRaw: record.allowRaw,
  }
  return { status: "ok", paste, owned, signedIn: viewer !== null }
}

// Shared by metadata, the share page and raw reads. React memoizes this only within a render;
// content reads and burn claims remain separate and are never cached across requests.
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
  const access = await sharedAccess(slug)
  if (access.status !== "ok") return access
  const { record, owned } = access
  if (!owned && (record.burnAfterRead || !record.allowRaw)) return { status: "forbidden" }
  const [file] = await getDb()
    .select({ name: pasteFile.name, language: pasteFile.language, content: pasteFile.content })
    .from(pasteFile)
    .where(eq(pasteFile.pasteId, record.id))
    .orderBy(
      name === null ? asc(pasteFile.position) : desc(sql`${pasteFile.name} = ${name}`),
      pasteFile.position,
      pasteFile.id,
    )
    .limit(1)
  return file ? { status: "ok", file } : { status: "missing" }
}

// The share page's title and indexing, without loading files or counting a view. A title is
// content too, so it's null for burn-after-read pastes and for pastes the visitor can't open.
export async function readSharedMeta(slug: string) {
  const access = await sharedAccess(slug)
  if (access.status !== "ok" || access.record.burnAfterRead) return null
  return { title: access.record.title, visibility: access.record.visibility }
}

// The stored password hash of a paste someone could be asked to unlock, for the unlock route.
export async function getUnlockHash(slug: string) {
  const record = await findLiveRecord(slug)
  return record && record.visibility !== "private" ? record.passwordHash : null
}

export async function navCounts(): Promise<NavCounts> {
  const viewer = await viewerId()
  if (!viewer) return { pastes: 0, starred: 0, shared: 0 }
  const db = getDb()
  const stars = await readableStarsWhere(viewer)
  const [[own], [starred]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pasteTable)
      .where(and(eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))),
    db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(stars),
  ])
  return { pastes: own?.count ?? 0, starred: starred?.count ?? 0, shared: 0 }
}

export const sidebarData = cache(async (): Promise<SidebarData> => {
  const viewer = await viewerId()
  if (!viewer) return { counts: { pastes: 0, starred: 0, shared: 0 }, recent: [], starred: [] }
  const db = getDb()
  const stars = await readableStarsWhere(viewer)
  const [[own], [starCount], recent, starred] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pasteTable)
      .where(and(eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))),
    db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(stars),
    db
      .select()
      .from(pasteTable)
      .where(and(eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt)))
      .orderBy(desc(pasteTable.updatedAt), pasteTable.id)
      .limit(SIDEBAR_RECENT),
    db
      .select()
      .from(pasteTable)
      .where(stars)
      .orderBy(desc(pasteTable.updatedAt), pasteTable.id)
      .limit(SIDEBAR_STARRED),
  ])
  const starSlugs = await starredSlugs([...recent, ...starred].map((record) => record.slug))
  const row = (record: PasteRecord) => ({
    slug: record.slug,
    title: record.title,
    owned: record.ownerId === viewer,
    starred: starSlugs.has(record.slug),
    collection: record.ownerId === viewer ? record.collection : null,
  })
  return {
    counts: { pastes: own?.count ?? 0, starred: starCount?.count ?? 0, shared: 0 },
    recent: recent.map(row),
    starred: starred.map(row),
  }
})

// The dashboard can hydrate its bounded recent selections without exposing the SQL layer.
export async function summarizePastes(records: PasteRecord[], viewer: string) {
  return summarize(records, viewer)
}

export async function isSlugAvailable(slug: string, except?: string) {
  if (!SLUG_PATTERN.test(slug) || RESERVED.has(slug.toLowerCase())) return false
  return slug === except || !(await findRecord(slug))
}

function randomSlug() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}

function fileRows(pasteId: string, files: PasteInput["files"]) {
  return files.map((file, position) => ({ pasteId, position, ...file }))
}

export async function createPaste(input: PasteInput) {
  const data = parsePasteInput(input)
  const owner = await requireViewerId()
  let slug = data.slug
  if (!slug) {
    do slug = randomSlug()
    while (await findRecord(slug))
  }

  const now = new Date()
  const id = crypto.randomUUID()
  const passwordHash = data.password ? await hashPassword(data.password) : null
  const bytes = data.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
  await getDb().transaction(async (tx) => {
    await enforceBudget(tx, owner, bytes)
    await tx.insert(pasteTable).values({
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
      createdAt: now,
      updatedAt: now,
      expiresAt: resolveExpiry(data.expiry, null, now.getTime()),
    })
    await tx.insert(pasteFile).values(fileRows(id, data.files))
    await tx.insert(pasteRevision).values({ pasteId: id, message: "Created", createdAt: now })
  })

  return { slug }
}

export async function updatePaste(slug: string, input: PasteInput, message: string) {
  const data = parsePasteInput(input)
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return null

  const now = new Date()
  // An empty password on edit keeps the existing one; the client never sees it.
  const passwordHash =
    data.password === ""
      ? record.passwordHash
      : data.password
        ? await hashPassword(data.password)
        : null

  const bytes = data.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
  await getDb().transaction(async (tx) => {
    await enforceBudget(tx, record.ownerId, bytes, record.id)
    await tx
      .update(pasteTable)
      .set({
        bytes,
        slug: data.slug || slug,
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        passwordHash,
        burnAfterRead: data.burnAfterRead,
        collection: data.collection,
        expiresAt: resolveExpiry(data.expiry, record.expiresAt, now.getTime()),
        updatedAt: now,
      })
      .where(eq(pasteTable.id, record.id))
    await tx.delete(pasteFile).where(eq(pasteFile.pasteId, record.id))
    await tx.insert(pasteFile).values(fileRows(record.id, data.files))
    await tx.insert(pasteRevision).values({ pasteId: record.id, message, createdAt: now })
  })

  return { slug: data.slug || slug }
}

export async function updateSharing(slug: string, input: SharingInput) {
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return null

  const { expiry, password, ...rest } = input
  await getDb()
    .update(pasteTable)
    .set({
      ...rest,
      ...(password !== undefined
        ? { passwordHash: password ? await hashPassword(password) : null }
        : {}),
      ...(expiry ? { expiresAt: at(expiresAtFor(expiry)) } : {}),
    })
    .where(eq(pasteTable.id, record.id))
  return { slug }
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
    await db.insert(pasteStar).values({ userId: viewer, pasteId: record.id }).onConflictDoNothing()
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
  await getDb().update(pasteTable).set({ title }).where(eq(pasteTable.id, record.id))
}

// Files the paste in a collection, or takes it out of its collection with null. The caller
// checks that the collection exists.
export async function setPasteCollection(slug: string, collection: string | null) {
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return
  await getDb().update(pasteTable).set({ collection }).where(eq(pasteTable.id, record.id))
}

export async function trashPaste(slug: string) {
  const record = await findOwned(slug)
  if (!record) return
  await getDb()
    .update(pasteTable)
    .set({ deletedAt: new Date() })
    .where(eq(pasteTable.id, record.id))
}

export async function restorePaste(slug: string) {
  const record = await findOwned(slug)
  if (!record) return
  await getDb().update(pasteTable).set({ deletedAt: null }).where(eq(pasteTable.id, record.id))
}

export async function deleteForever(slug: string) {
  const record = await findOwned(slug)
  if (!record?.deletedAt) return
  await getDb().delete(pasteTable).where(eq(pasteTable.id, record.id))
}

export async function emptyTrash() {
  const viewer = await requireViewerId()
  await getDb()
    .delete(pasteTable)
    .where(and(eq(pasteTable.ownerId, viewer), isNotNull(pasteTable.deletedAt)))
}
