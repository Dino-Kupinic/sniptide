import "server-only"
import type { Database } from "@workspace/db"
import { paste, user } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { cache } from "react"
import { getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export class PasteBudgetError extends Error {}
// The limits from ACCOUNT_STORAGE_BYTES and ACCOUNT_PASTE_LIMIT; null means no limit.
export function accountBudget() {
  return getConfig().accountLimits
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
// Acquire the account lock before any paste-row lock to keep saves and restores in one order.
export async function lockAccount(tx: Transaction, owner: string) {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, owner)).for("update")
}

// Trash still occupies storage. Deletion can only reduce usage, and an over-budget account
// may still shrink a paste.
export async function enforceBudget(
  tx: Transaction,
  owner: string,
  bytes: number,
  editingId?: string,
) {
  await lockAccount(tx, owner)
  const limit = accountBudget()
  if (limit.bytes === null && limit.pastes === null) return
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
  if (!editingId && limit.pastes !== null && (usage?.pastes ?? 0) >= limit.pastes)
    throw new PasteBudgetError(
      "You've reached your paste limit. Permanently delete some pastes to create another.",
    )
  if (limit.bytes !== null && delta > 0 && (usage?.bytes ?? 0) + delta > limit.bytes)
    throw new PasteBudgetError(
      "You've reached your storage limit. Permanently delete some pastes or reduce their size.",
    )
}
