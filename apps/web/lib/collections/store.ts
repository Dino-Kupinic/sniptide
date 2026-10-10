import "server-only"

import { collection as collectionTable, paste as pasteTable } from "@workspace/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import {
  type Collection,
  type CollectionIcon,
  HUES,
  type Hue,
  ICONS,
  MAX_COLLECTIONS,
} from "./types"

// Collections group a user's own pastes. Each belongs to one account and is only ever read or
// changed through the signed-in viewer; a paste points at one by its slug (paste.collection).

async function viewerId() {
  return (await getSession())?.user.id ?? null
}

async function requireViewerId() {
  const id = await viewerId()
  if (!id) throw new Error("Sign in to change collections.")
  return id
}

// "API snippets" -> "api-snippets". A name with nothing sluggable in it (all emoji, say) still
// gets a link.
export function slugify(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
  return slug || "collection"
}

function toCollection(row: {
  slug: string
  name: string
  icon: string
  hue: string
  pasteCount: number
}): Collection {
  const icon = ICONS.find((candidate) => candidate === row.icon) ?? ICONS[0]
  const hue = HUES.find((candidate) => candidate === row.hue) ?? "blue"
  return { slug: row.slug, name: row.name, icon, hue, pasteCount: row.pasteCount }
}

// The viewer's collections, oldest first, with how many live pastes each holds.
export async function listCollections(): Promise<Collection[]> {
  const viewer = await viewerId()
  if (!viewer) return []
  const rows = await getDb()
    .select({
      slug: collectionTable.slug,
      name: collectionTable.name,
      icon: collectionTable.icon,
      hue: collectionTable.hue,
      pasteCount: sql<number>`count(${pasteTable.id})::int`,
    })
    .from(collectionTable)
    .leftJoin(
      pasteTable,
      and(
        eq(pasteTable.ownerId, collectionTable.ownerId),
        eq(pasteTable.collection, collectionTable.slug),
        isNull(pasteTable.deletedAt),
      ),
    )
    .where(eq(collectionTable.ownerId, viewer))
    .groupBy(collectionTable.id)
    .orderBy(collectionTable.createdAt, collectionTable.id)
  return rows.map(toCollection)
}

export async function getCollection(slug: string) {
  return (await listCollections()).find((candidate) => candidate.slug === slug) ?? null
}

// Whether the viewer has a collection with this slug, for checking where a paste is being filed.
export async function collectionExists(slug: string) {
  const viewer = await viewerId()
  if (!viewer) return false
  const [row] = await getDb()
    .select({ id: collectionTable.id })
    .from(collectionTable)
    .where(and(eq(collectionTable.ownerId, viewer), eq(collectionTable.slug, slug)))
  return Boolean(row)
}

export type CollectionResult =
  | { status: "ok"; collection: Collection }
  | { status: "duplicate" }
  | { status: "limit" }
  | { status: "missing" }

function sameName(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0
}

export async function createCollection(name: string): Promise<CollectionResult> {
  const owner = await requireViewerId()
  const db = getDb()

  const existing = await db
    .select({ slug: collectionTable.slug, name: collectionTable.name })
    .from(collectionTable)
    .where(eq(collectionTable.ownerId, owner))
  if (existing.length >= MAX_COLLECTIONS) return { status: "limit" }
  if (existing.some((row) => sameName(row.name, name))) return { status: "duplicate" }

  // Names that slug alike ("a b" and "a-b") get a numbered link. A concurrent create can take the
  // slug first, so a conflict moves on to the next number instead of failing.
  const base = slugify(name)
  const taken = new Set(existing.map((row) => row.slug))
  // New collections start as a solid square, each in the next hue, so neighbors tell apart.
  const hue = HUES[(existing.length + 1) % HUES.length] ?? "blue"
  for (let attempt = 1; attempt <= 10; attempt++) {
    const slug = attempt === 1 ? base : `${base.slice(0, 36)}-${attempt}`
    if (taken.has(slug)) continue
    const [row] = await db
      .insert(collectionTable)
      .values({ ownerId: owner, slug, name, icon: "square", hue })
      .onConflictDoNothing()
      .returning()
    if (row) return { status: "ok", collection: toCollection({ ...row, pasteCount: 0 }) }
  }
  return { status: "duplicate" }
}

export async function renameCollection(slug: string, name: string): Promise<CollectionResult> {
  const owner = await requireViewerId()
  const db = getDb()

  const all = await db
    .select({ slug: collectionTable.slug, name: collectionTable.name })
    .from(collectionTable)
    .where(eq(collectionTable.ownerId, owner))
  if (!all.some((row) => row.slug === slug)) return { status: "missing" }
  if (all.some((row) => row.slug !== slug && sameName(row.name, name))) {
    return { status: "duplicate" }
  }

  await db
    .update(collectionTable)
    .set({ name })
    .where(and(eq(collectionTable.ownerId, owner), eq(collectionTable.slug, slug)))
  const renamed = await getCollection(slug)
  return renamed ? { status: "ok", collection: renamed } : { status: "missing" }
}

export async function setCollectionIcon(slug: string, icon: CollectionIcon, hue: Hue) {
  const owner = await requireViewerId()
  await getDb()
    .update(collectionTable)
    .set({ icon, hue })
    .where(and(eq(collectionTable.ownerId, owner), eq(collectionTable.slug, slug)))
}

// Deletes the collection and takes its pastes out of it; the pastes themselves stay, trashed ones
// included, so restoring one never points at a collection that is gone.
export async function deleteCollection(slug: string) {
  const owner = await requireViewerId()
  await getDb().transaction(async (tx) => {
    await tx
      .update(pasteTable)
      .set({ collection: null })
      .where(and(eq(pasteTable.ownerId, owner), eq(pasteTable.collection, slug)))
    await tx
      .delete(collectionTable)
      .where(and(eq(collectionTable.ownerId, owner), eq(collectionTable.slug, slug)))
  })
}
