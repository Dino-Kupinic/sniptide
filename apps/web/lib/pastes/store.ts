import "server-only"

import {
  pasteFile,
  pasteRevision,
  pasteStar,
  paste as pasteTable,
  pasteViewDay,
  user,
} from "@workspace/db/schema"
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import { cookies } from "next/headers"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { hashPassword } from "./passwords"
import type { Expiry, Paste, PasteInput, Person, Share, SharingInput } from "./types"
import { unlockCookieName, unlockToken } from "./unlock"

// Pastes in Postgres (packages/db/src/schema/pastes.ts). Every paste belongs to one account; the
// signed-in viewer sees their own pastes in the app, and anyone can open a paste's public link
// (subject to visibility, password and expiry).
//
// Reading a paste's content goes through two functions, and each checks who is asking before it
// loads anything: `getOwnPaste` for the app's own screens and `readSharedPaste` for its public
// link. Don't add a read that skips them; a page that fetches first and checks later still sends
// the data to the client.

const DAY = 86_400_000
export const TRASH_DAYS = 30
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0]?.[0]}${parts.at(-1)?.[0]}` : name.slice(0, 2)
  return letters.toUpperCase() || "?"
}

// Turns paste rows into the Paste shape the screens read, loading files, revisions, view
// history and authors in one query each.
async function hydrate(records: PasteRecord[], viewer: string | null): Promise<Paste[]> {
  if (records.length === 0) return []
  const db = getDb()
  const ids = records.map((record) => record.id)
  const today = utcDay(Date.now())
  const firstDay = today - VIEW_HISTORY_DAYS + 1

  const [files, revisions, days, authors] = await Promise.all([
    db.select().from(pasteFile).where(inArray(pasteFile.pasteId, ids)).orderBy(pasteFile.position),
    db
      .select()
      .from(pasteRevision)
      .where(inArray(pasteRevision.pasteId, ids))
      .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id)),
    db
      .select()
      .from(pasteViewDay)
      .where(and(inArray(pasteViewDay.pasteId, ids), gte(pasteViewDay.day, firstDay))),
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

  return records.map((record) => {
    const viewsByDay = Array<number>(VIEW_HISTORY_DAYS).fill(0)
    for (const day of days) {
      if (day.pasteId === record.id) viewsByDay[day.day - firstDay] = day.views
    }
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
      files: files
        .filter((file) => file.pasteId === record.id)
        .map(({ name, language, content }) => ({ name, language, content })),
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
      revisions: revisions
        .filter((revision) => revision.pasteId === record.id)
        .map(({ message, createdAt }) => ({ message, createdAt: ms(createdAt) })),
    }
  })
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

async function purgeTrash(owner: string) {
  await getDb()
    .delete(pasteTable)
    .where(
      and(
        eq(pasteTable.ownerId, owner),
        isNotNull(pasteTable.deletedAt),
        lt(pasteTable.deletedAt, new Date(Date.now() - TRASH_DAYS * DAY)),
      ),
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
  return hydrate(records, viewer)
}

export async function listTrash() {
  const viewer = await viewerId()
  if (!viewer) return []
  await purgeTrash(viewer)
  const records = await getDb()
    .select()
    .from(pasteTable)
    .where(and(eq(pasteTable.ownerId, viewer), isNotNull(pasteTable.deletedAt)))
    .orderBy(desc(pasteTable.deletedAt))
  return hydrate(records, viewer)
}

// Sharing pastes with other accounts isn't built yet; "Shared with me" stays empty until then.
export async function listShared(): Promise<{ share: Share & { seen: boolean }; paste: Paste }[]> {
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

// The viewer's starred pastes that they can still read; one that has since gone private, expired
// or been locked behind a new password drops out of the list (and the count) without losing the star.
async function starredRecords(viewer: string) {
  const rows = await getDb()
    .select({ paste: pasteTable })
    .from(pasteStar)
    .innerJoin(pasteTable, eq(pasteStar.pasteId, pasteTable.id))
    .where(and(eq(pasteStar.userId, viewer), isNull(pasteTable.deletedAt)))
    .orderBy(desc(pasteTable.updatedAt))
  const readable = await Promise.all(
    rows.map(async ({ paste }) => ((await viewerMayRead(paste, viewer)) ? paste : null)),
  )
  return readable.filter((record) => record !== null)
}

export async function listStarred() {
  const viewer = await viewerId()
  if (!viewer) return []
  return hydrate(await starredRecords(viewer), viewer)
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

// One of the viewer's own pastes, for the app's screens (detail, edit, duplicate). Anyone else's
// paste, a trashed one and a missing one all come back as null.
export async function getOwnPaste(slug: string) {
  const viewer = await viewerId()
  if (!viewer) return null
  const [record] = await getDb()
    .select()
    .from(pasteTable)
    .where(
      and(eq(pasteTable.slug, slug), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt)),
    )
  if (!record) return null
  const [paste] = await hydrate([record], viewer)
  return paste ?? null
}

export type SharedRead =
  | { status: "ok"; paste: Paste; owned: boolean; signedIn: boolean }
  | { status: "locked" }
  | { status: "missing" }

// A live paste (not trashed, not expired) by its link, or null.
async function findLiveRecord(slug: string) {
  const record = await findRecord(slug)
  return record && !record.deletedAt && !recordExpired(record) ? record : null
}

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
// the visitor may see it. `visit` marks the share page opening it: that counts a view for anyone
// but the owner and burns a burn-after-read paste, so a visitor who loses that race gets
// "missing" instead of a copy.
export async function readSharedPaste(
  slug: string,
  options: { visit?: boolean } = {},
): Promise<SharedRead> {
  const found = await findLiveRecord(slug)
  if (!found) return { status: "missing" }

  const viewer = await viewerId()
  const verdict = await canOpenLink(found, viewer)
  if (verdict !== "ok") return { status: verdict }

  const owned = found.ownerId === viewer
  const record = options.visit && !owned ? await claimVisit(found.id) : found
  if (!record) return { status: "missing" }

  const [paste] = await hydrate([record], viewer)
  if (!paste) return { status: "missing" }
  return { status: "ok", paste, owned, signedIn: viewer !== null }
}

// The stored password hash of a paste someone could be asked to unlock, for the unlock route.
export async function getUnlockHash(slug: string) {
  const record = await findLiveRecord(slug)
  return record && record.visibility !== "private" ? record.passwordHash : null
}

export async function navCounts() {
  const viewer = await viewerId()
  if (!viewer) return { pastes: 0, starred: 0, shared: 0 }
  const db = getDb()
  const [[own], starred] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pasteTable)
      .where(and(eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))),
    starredRecords(viewer),
  ])
  return { pastes: own?.count ?? 0, starred: starred.length, shared: 0 }
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
  const owner = await requireViewerId()
  let slug = input.slug
  if (!slug) {
    do slug = randomSlug()
    while (await findRecord(slug))
  }

  const now = new Date()
  const id = crypto.randomUUID()
  const passwordHash = input.password ? await hashPassword(input.password) : null
  await getDb().transaction(async (tx) => {
    await tx.insert(pasteTable).values({
      id,
      slug,
      ownerId: owner,
      title: input.title,
      description: input.description,
      visibility: input.visibility,
      passwordHash,
      burnAfterRead: input.burnAfterRead,
      collection: input.collection,
      createdAt: now,
      updatedAt: now,
      expiresAt: resolveExpiry(input.expiry, null, now.getTime()),
    })
    await tx.insert(pasteFile).values(fileRows(id, input.files))
    await tx.insert(pasteRevision).values({ pasteId: id, message: "Created", createdAt: now })
  })

  return { slug }
}

export async function updatePaste(slug: string, input: PasteInput, message: string) {
  const record = await findOwned(slug)
  if (!record || record.deletedAt) return null

  const now = new Date()
  // An empty password on edit keeps the existing one; the client never sees it.
  const passwordHash =
    input.password === ""
      ? record.passwordHash
      : input.password
        ? await hashPassword(input.password)
        : null

  await getDb().transaction(async (tx) => {
    await tx
      .update(pasteTable)
      .set({
        slug: input.slug || slug,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        passwordHash,
        burnAfterRead: input.burnAfterRead,
        collection: input.collection,
        expiresAt: resolveExpiry(input.expiry, record.expiresAt, now.getTime()),
        updatedAt: now,
      })
      .where(eq(pasteTable.id, record.id))
    await tx.delete(pasteFile).where(eq(pasteFile.pasteId, record.id))
    await tx.insert(pasteFile).values(fileRows(record.id, input.files))
    await tx.insert(pasteRevision).values({ pasteId: record.id, message, createdAt: now })
  })

  return { slug: input.slug || slug }
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
