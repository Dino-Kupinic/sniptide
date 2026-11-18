import "server-only"

import { allowedPaste } from "@workspace/db/moderation"
import { paste as pasteTable } from "@workspace/db/schema"
import { and, eq } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// The viewer and the paste rows that the session-side paste modules start from.

type PasteRecord = typeof pasteTable.$inferSelect

export async function viewerId() {
  return (await getSession())?.user.id ?? null
}

export async function requireViewerId() {
  const id = await viewerId()
  if (!id) throw new Error("Sign in to change pastes.")
  return id
}

// The tables store timestamps; the screens work in epoch milliseconds.
export function ms(date: Date): number
export function ms(date: Date | null): number | null
export function ms(date: Date | null) {
  return date ? date.getTime() : null
}

export async function findRecord(slug: string, includeRestricted = false) {
  const [record] = await getDb()
    .select()
    .from(pasteTable)
    .where(and(includeRestricted ? undefined : allowedPaste(), eq(pasteTable.slug, slug)))
  return record ?? null
}

// A paste the viewer owns, trashed or not.
export async function findOwned(slug: string, includeRestricted = false) {
  const viewer = await requireViewerId()
  const record = await findRecord(slug, includeRestricted)
  return record && record.ownerId === viewer ? record : null
}

export function recordExpired(record: Pick<PasteRecord, "expiresAt">) {
  return record.expiresAt !== null && record.expiresAt.getTime() <= Date.now()
}
