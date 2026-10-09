import "server-only"

import { paste, pasteShare, pasteStar } from "@workspace/db/schema"
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { seedPastes, seedShares, seedStarred, VIEW_HISTORY_DAYS } from "./seed"
import type { Expiry, Paste, PasteInput, Share, SharingInput } from "./types"

// Paste store on the SQLite database (see packages/db/src/schema/pastes.ts). Every signed-in
// account sees the same workspace until pastes get an owner column.
// On an empty database the seed content from the Paper screens is inserted once at startup.

const DAY = 86_400_000
export const TRASH_DAYS = 30

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
])

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,40}$/

// Pastes without an owner are the viewer's own. The owner column is JSON, so a null can be
// stored as SQL NULL or as the text "null"; both count.
const notOwned = sql`(${paste.owner} is null or ${paste.owner} = 'null')`

let seeding: Promise<void> | undefined

// Runs the one-time seed before the first query, then hands back the database.
async function ready() {
  const db = getDb()
  seeding ??= seedIfEmpty().catch((error) => {
    seeding = undefined
    throw error
  })
  await seeding
  return db
}

async function seedIfEmpty() {
  const db = getDb()
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(paste)
  if (Number(row?.count ?? 0) > 0) return

  const now = Date.now()
  const pastes = seedPastes(now)
  const slugs = new Set(pastes.map((item) => item.slug))
  await db.insert(paste).values(pastes)

  const shares = seedShares(now).filter((share) => slugs.has(share.slug))
  if (shares.length) await db.insert(pasteShare).values(shares)

  const stars = seedStarred.filter((slug) => slugs.has(slug))
  if (stars.length)
    await db.insert(pasteStar).values(stars.map((slug) => ({ slug, starredAt: now })))
}

async function purgeTrash() {
  const db = await ready()
  await db.delete(paste).where(lt(paste.deletedAt, Date.now() - TRASH_DAYS * DAY))
}

export function expiresAtFor(expiry: Expiry, from = Date.now()) {
  return expiry === "never" ? null : from + EXPIRY_MS[expiry]
}

function resolveExpiry(expiry: Expiry | "keep", current: number | null, from: number) {
  return expiry === "keep" ? current : expiresAtFor(expiry, from)
}

export function isExpired(paste: Paste) {
  return paste.expiresAt !== null && paste.expiresAt <= Date.now()
}

export async function listOwnPastes() {
  const db = await ready()
  return db
    .select()
    .from(paste)
    .where(and(notOwned, isNull(paste.deletedAt)))
    .orderBy(desc(paste.updatedAt)) as Promise<Paste[]>
}

export async function listTrash() {
  await purgeTrash()
  const db = await ready()
  return db
    .select()
    .from(paste)
    .where(and(notOwned, isNotNull(paste.deletedAt)))
    .orderBy(desc(paste.deletedAt)) as Promise<Paste[]>
}

export async function listShared() {
  const db = await ready()
  const rows = await db
    .select({ share: pasteShare, paste })
    .from(pasteShare)
    .innerJoin(paste, eq(pasteShare.slug, paste.slug))
    .where(isNull(paste.deletedAt))
    .orderBy(desc(pasteShare.sharedAt))
  return rows as { share: Share & { seen: boolean }; paste: Paste }[]
}

export async function listStarred() {
  const db = await ready()
  const rows = await db
    .select({ paste })
    .from(pasteStar)
    .innerJoin(paste, eq(pasteStar.slug, paste.slug))
    .where(isNull(paste.deletedAt))
    .orderBy(desc(paste.updatedAt))
  return rows.map((row) => row.paste as Paste)
}

export async function isStarred(slug: string) {
  const db = await ready()
  const rows = await db
    .select({ slug: pasteStar.slug })
    .from(pasteStar)
    .where(eq(pasteStar.slug, slug))
  return rows.length > 0
}

export async function getShare(slug: string) {
  const db = await ready()
  const [row] = await db.select().from(pasteShare).where(eq(pasteShare.slug, slug)).limit(1)
  return (row as (Share & { seen: boolean }) | undefined) ?? null
}

export async function getPaste(slug: string) {
  const db = await ready()
  const [row] = await db
    .select()
    .from(paste)
    .where(and(eq(paste.slug, slug), isNull(paste.deletedAt)))
    .limit(1)
  return (row as Paste | undefined) ?? null
}

async function slugTaken(slug: string) {
  const db = await ready()
  const rows = await db
    .select({ slug: paste.slug })
    .from(paste)
    .where(eq(paste.slug, slug))
    .limit(1)
  return rows.length > 0
}

export async function navCounts() {
  return {
    pastes: (await listOwnPastes()).length,
    starred: (await listStarred()).length,
    shared: (await listShared()).length,
  }
}

export async function isSlugAvailable(slug: string, except?: string) {
  if (!SLUG_PATTERN.test(slug) || RESERVED.has(slug.toLowerCase())) return false
  if (slug === except) return true
  return !(await slugTaken(slug))
}

function randomSlug() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}

export async function createPaste(input: PasteInput) {
  const db = await ready()
  let slug = input.slug
  if (!slug) {
    do slug = randomSlug()
    while (await slugTaken(slug))
  }

  const now = Date.now()
  const row: Paste = {
    slug,
    title: input.title,
    description: input.description,
    files: input.files,
    visibility: input.visibility,
    password: input.password,
    burnAfterRead: input.burnAfterRead,
    allowRaw: true,
    collection: input.collection,
    owner: null,
    views: 0,
    uniqueViews: 0,
    viewsByDay: Array(VIEW_HISTORY_DAYS).fill(0),
    createdAt: now,
    updatedAt: now,
    expiresAt: resolveExpiry(input.expiry, null, now),
    deletedAt: null,
    revisions: [{ message: "Created", createdAt: now }],
  }
  await db.insert(paste).values(row)

  return row
}

export async function updatePaste(slug: string, input: PasteInput, message: string) {
  const current = await getPaste(slug)
  if (!current) return null

  const db = await ready()
  const now = Date.now()
  const updated: Paste = {
    ...current,
    slug: input.slug || slug,
    title: input.title,
    description: input.description,
    files: input.files,
    visibility: input.visibility,
    // An empty password on edit keeps the existing one; the client never sees it.
    password: input.password === "" ? current.password : input.password,
    burnAfterRead: input.burnAfterRead,
    collection: input.collection,
    expiresAt: resolveExpiry(input.expiry, current.expiresAt, now),
    updatedAt: now,
    revisions: [{ message, createdAt: now }, ...current.revisions],
  }

  // Renaming the slug cascades to the share and star rows through their foreign keys.
  await db.update(paste).set(updated).where(eq(paste.slug, slug))

  return updated
}

export async function updateSharing(slug: string, input: SharingInput) {
  const db = await ready()
  const { expiry, ...rest } = input
  const changes: Partial<typeof paste.$inferInsert> = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  )
  if (expiry) changes.expiresAt = expiresAtFor(expiry)
  if (Object.keys(changes).length === 0) return getPaste(slug)

  const [row] = await db
    .update(paste)
    .set(changes)
    .where(and(eq(paste.slug, slug), isNull(paste.deletedAt)))
    .returning()
  return (row as Paste | undefined) ?? null
}

export async function setStarred(slug: string, starred: boolean) {
  const db = await ready()
  if (starred) {
    await db.insert(pasteStar).values({ slug, starredAt: Date.now() }).onConflictDoNothing()
  } else {
    await db.delete(pasteStar).where(eq(pasteStar.slug, slug))
  }
}

export async function markShareSeen(slug: string) {
  const db = await ready()
  await db.update(pasteShare).set({ seen: true }).where(eq(pasteShare.slug, slug))
}

export async function trashPaste(slug: string) {
  const db = await ready()
  await db
    .update(paste)
    .set({ deletedAt: Date.now() })
    .where(and(eq(paste.slug, slug), notOwned))
}

export async function restorePaste(slug: string) {
  const db = await ready()
  await db.update(paste).set({ deletedAt: null }).where(eq(paste.slug, slug))
}

export async function deleteForever(slug: string) {
  const db = await ready()
  await db.delete(paste).where(and(eq(paste.slug, slug), isNotNull(paste.deletedAt)))
}

export async function emptyTrash() {
  const db = await ready()
  await db.delete(paste).where(and(notOwned, isNotNull(paste.deletedAt)))
}

// Counts a visit from the public page. Burn-after-read pastes go to the trash after the first
// view that isn't the owner's.
export async function recordView(slug: string) {
  const current = await getPaste(slug)
  if (!current) return

  const db = await ready()
  const viewsByDay = [...current.viewsByDay]
  viewsByDay[viewsByDay.length - 1] = (viewsByDay.at(-1) ?? 0) + 1
  await db
    .update(paste)
    .set({
      views: sql`${paste.views} + 1`,
      uniqueViews: sql`${paste.uniqueViews} + 1`,
      viewsByDay,
      ...(current.burnAfterRead ? { deletedAt: Date.now() } : {}),
    })
    .where(eq(paste.slug, slug))
}
