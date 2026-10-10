import "server-only"
import type { Database } from "@workspace/db"
import { envInteger } from "@workspace/db/config"
import { paste, user } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { cache } from "react"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export class PasteBudgetError extends Error {}
export function accountBudget() {
  return {
    bytes: envInteger(
      "ACCOUNT_STORAGE_BYTES",
      1024 * 1024 * 1024,
      524288,
      1024 * 1024 * 1024 * 1024,
    ),
    pastes: envInteger("ACCOUNT_PASTE_LIMIT", 10000, 1, 1000000),
  }
}
export const storageUsage = cache(async () => {
  const owner = (await getSession())?.user.id
  const limit = accountBudget()
  if (!owner) return { bytes: 0, pastes: 0, limit }
  const [row] = await getDb()
    .select({
      bytes: sql<number>`coalesce(sum(${paste.bytes}), 0)::float8`,
      pastes: sql<number>`count(*)::int`,
    })
    .from(paste)
    .where(eq(paste.ownerId, owner))
  return { bytes: row?.bytes ?? 0, pastes: row?.pastes ?? 0, limit }
})
// A user-row lock serializes creates/edits across replicas. Trash still occupies storage.
// Deletion can only reduce usage, and an over-budget account may still shrink a paste.
export async function enforceBudget(
  tx: Transaction,
  owner: string,
  bytes: number,
  editingId?: string,
) {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, owner)).for("update")
  const [usage] = await tx
    .select({
      bytes: sql<number>`coalesce(sum(${paste.bytes}), 0)::float8`,
      pastes: sql<number>`count(*)::int`,
    })
    .from(paste)
    .where(eq(paste.ownerId, owner))
  const [existing] = editingId
    ? await tx.select({ bytes: paste.bytes }).from(paste).where(eq(paste.id, editingId))
    : []
  const delta = bytes - (existing?.bytes ?? 0)
  const limit = accountBudget()
  if (!editingId && (usage?.pastes ?? 0) >= limit.pastes)
    throw new PasteBudgetError(
      "You've reached your paste limit. Permanently delete some pastes to create another.",
    )
  if (delta > 0 && (usage?.bytes ?? 0) + delta > limit.bytes)
    throw new PasteBudgetError(
      "You've reached your storage limit. Permanently delete some pastes or reduce their size.",
    )
}
