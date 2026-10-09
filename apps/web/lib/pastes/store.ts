import "server-only"

import {
  pasteFile,
  pasteRevision,
  pasteStar,
  paste as pasteTable,
  pasteViewDay,
  user,
} from "@workspace/db/schema"
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { hashPassword } from "./passwords"
import type { Expiry, Paste, PasteInput, Person, Share, SharingInput } from "./types"

// Pastes in Postgres (packages/db/src/schema/pastes.ts). Every paste belongs to one account; the
// signed-in viewer sees their own pastes in the app, and anyone can open a paste's public link
// (subject to visibility, password and expiry, see ./access.ts).

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

export function isExpired(paste: Paste) {
  return paste.expiresAt !== null && paste.expiresAt <= Date.now()
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

export async function listStarred() {
  const viewer = await viewerId()
  if (!viewer) return []
  const rows = await getDb()
    .select({ paste: pasteTable })
    .from(pasteStar)
    .innerJoin(pasteTable, eq(pasteStar.pasteId, pasteTable.id))
    .where(and(eq(pasteStar.userId, viewer), isNull(pasteTable.deletedAt)))
    .orderBy(desc(pasteTable.updatedAt))
  return hydrate(
    rows.map((row) => row.paste),
    viewer,
  )
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

// Any paste by its link, for the public page and raw files; access rules live in ./access.ts.
export async function getPaste(slug: string) {
  const record = await findRecord(slug)
  if (!record || record.deletedAt) return null
  const [paste] = await hydrate([record], await viewerId())
  return paste ?? null
}

export async function navCounts() {
  const viewer = await viewerId()
  if (!viewer) return { pastes: 0, starred: 0, shared: 0 }
  const db = getDb()
  const [[own], [starred]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pasteTable)
      .where(and(eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pasteStar)
      .innerJoin(pasteTable, eq(pasteStar.pasteId, pasteTable.id))
      .where(and(eq(pasteStar.userId, viewer), isNull(pasteTable.deletedAt))),
  ])
  return { pastes: own?.count ?? 0, starred: starred?.count ?? 0, shared: 0 }
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

// Counts a visit from the public page. Burn-after-read pastes go to the trash after the first
// view that isn't the owner's.
export async function recordView(slug: string) {
  const record = await findRecord(slug)
  if (!record || record.deletedAt) return

  const now = new Date()
  await getDb().transaction(async (tx) => {
    await tx
      .update(pasteTable)
      .set({
        views: sql`${pasteTable.views} + 1`,
        uniqueViews: sql`${pasteTable.uniqueViews} + 1`,
        ...(record.burnAfterRead ? { deletedAt: now } : {}),
      })
      .where(eq(pasteTable.id, record.id))
    await tx
      .insert(pasteViewDay)
      .values({ pasteId: record.id, day: utcDay(now.getTime()), views: 1 })
      .onConflictDoUpdate({
        target: [pasteViewDay.pasteId, pasteViewDay.day],
        set: { views: sql`${pasteViewDay.views} + 1` },
      })
  })
}
