import "server-only"

import { collection as collectionTable, paste as pasteTable, user } from "@workspace/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { cache } from "react"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import {
  type Collection,
  type CollectionIcon,
  defaultHue,
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
export const listCollections = cache(async (): Promise<Collection[]> => {
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
})

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

// Lock the owner's row before checking names/counts. Every create and rename takes the same
// database lock, so concurrent requests across app instances see each other's committed changes.
export async function createCollection(
  name: string,
  look?: { icon: CollectionIcon; hue: Hue },
): Promise<CollectionResult> {
  const owner = await requireViewerId()
  return getDb().transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, owner)).for("update")
    const existing = await tx
      .select({ slug: collectionTable.slug, name: collectionTable.name })
      .from(collectionTable)
      .where(eq(collectionTable.ownerId, owner))
    if (existing.length >= MAX_COLLECTIONS) return { status: "limit" }
    if (existing.some((row) => sameName(row.name, name))) return { status: "duplicate" }

    const base = slugify(name)
    const taken = new Set(existing.map((row) => row.slug))
    const { icon, hue } = look ?? { icon: "square" as const, hue: defaultHue(existing.length) }
    for (let attempt = 1; attempt <= MAX_COLLECTIONS + 1; attempt++) {
      const slug = attempt === 1 ? base : `${base.slice(0, 36)}-${attempt}`
      if (taken.has(slug)) continue
      const [row] = await tx
        .insert(collectionTable)
        .values({ ownerId: owner, slug, name, icon, hue })
        .onConflictDoNothing()
        .returning()
      if (row) return { status: "ok", collection: toCollection({ ...row, pasteCount: 0 }) }
    }
    return { status: "duplicate" }
  })
}

export async function renameCollection(slug: string, name: string): Promise<CollectionResult> {
  const owner = await requireViewerId()
  return getDb().transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, owner)).for("update")
    const all = await tx
      .select({ slug: collectionTable.slug, name: collectionTable.name })
      .from(collectionTable)
      .where(eq(collectionTable.ownerId, owner))
    if (!all.some((row) => row.slug === slug)) return { status: "missing" }
    if (all.some((row) => row.slug !== slug && sameName(row.name, name))) {
      return { status: "duplicate" }
    }
    const [row] = await tx
      .update(collectionTable)
      .set({ name })
      .where(and(eq(collectionTable.ownerId, owner), eq(collectionTable.slug, slug)))
      .returning()
    if (!row) return { status: "missing" }
    const [count] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(pasteTable)
      .where(
        and(
          eq(pasteTable.ownerId, owner),
          eq(pasteTable.collection, slug),
          isNull(pasteTable.deletedAt),
        ),
      )
    return { status: "ok", collection: toCollection({ ...row, pasteCount: count?.value ?? 0 }) }
  })
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
