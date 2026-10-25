import "server-only"

import type { Database } from "@workspace/db"
import { accountUsage, apiTokenUsageDay } from "@workspace/db/schema"
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm"
import type { TokenOwner } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"

export const USAGE_HISTORY_DAYS = 30
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export async function recordApiRequest(owner: TokenOwner, now = new Date()) {
  await getDb()
    .insert(apiTokenUsageDay)
    .values({
      ownerId: owner.userId,
      tokenId: owner.tokenId,
      day: Math.floor(now.getTime() / DAY),
      requests: 1,
    })
    .onConflictDoUpdate({
      target: [apiTokenUsageDay.ownerId, apiTokenUsageDay.day, apiTokenUsageDay.tokenId],
      set: { requests: sql`${apiTokenUsageDay.requests} + 1` },
    })
}

export async function getAccountUsage(owner: string, now = new Date()) {
  const today = Math.floor(now.getTime() / DAY)
  const [[usage], apiRequests] = await Promise.all([
    getDb().select().from(accountUsage).where(eq(accountUsage.ownerId, owner)),
    getDb()
      .select({
        tokenId: apiTokenUsageDay.tokenId,
        day: apiTokenUsageDay.day,
        requests: apiTokenUsageDay.requests,
      })
      .from(apiTokenUsageDay)
      .where(
        and(
          eq(apiTokenUsageDay.ownerId, owner),
          gte(apiTokenUsageDay.day, today - USAGE_HISTORY_DAYS + 1),
          lte(apiTokenUsageDay.day, today),
        ),
      )
      .orderBy(asc(apiTokenUsageDay.day), asc(apiTokenUsageDay.tokenId)),
  ])
  if (!usage) throw new Error("Account usage is missing.")
  return {
    storageBytes: usage.storageBytes,
    pasteCount: usage.pasteCount,
    fileCount: usage.fileCount,
    collectionCount: usage.collectionCount,
    reconciledAt: usage.reconciledAt.toISOString(),
    apiRequests,
  }
}

async function recount(tx: Transaction, owners: string[]) {
  if (!owners.length) return
  // The counter locks are acquired in an earlier statement, so this snapshot includes every
  // delta committed before the locks. Writers still in flight apply their deltas afterward.
  await tx.execute(sql`
    UPDATE account_usage AS usage SET
      storage_bytes = (SELECT coalesce(sum(bytes), 0) FROM paste WHERE owner_id = usage.owner_id),
      paste_count = (SELECT count(*) FROM paste WHERE owner_id = usage.owner_id),
      file_count = (SELECT count(*) FROM paste_file AS f JOIN paste AS p ON p.id = f.paste_id WHERE p.owner_id = usage.owner_id),
      collection_count = (SELECT count(*) FROM collection WHERE owner_id = usage.owner_id),
      reconciled_at = clock_timestamp()
    WHERE usage.owner_id IN (${sql.join(
      owners.map((owner) => sql`${owner}`),
      sql`, `,
    )})
  `)
}

export async function reconcileAccountUsage(owner: string) {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select({ owner: accountUsage.ownerId })
      .from(accountUsage)
      .where(eq(accountUsage.ownerId, owner))
      .for("update")
    await recount(
      tx,
      rows.map((row) => row.owner),
    )
    return rows.length > 0
  })
}

export async function reconcileUsageBatch(now = new Date()) {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select({ owner: accountUsage.ownerId })
      .from(accountUsage)
      .where(lt(accountUsage.reconciledAt, new Date(now.getTime() - DAY)))
      .orderBy(asc(accountUsage.reconciledAt), asc(accountUsage.ownerId))
      .limit(100)
      .for("update", { skipLocked: true })
    await recount(
      tx,
      rows.map((row) => row.owner),
    )
    return rows.length
  })
}

const jobs = globalThis as typeof globalThis & {
  __sniptideUsageTimer?: ReturnType<typeof setInterval>
}

export function scheduleUsageReconciliation() {
  if (jobs.__sniptideUsageTimer) return
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await reconcileUsageBatch()
    } catch (error) {
      console.error("Account usage reconciliation failed", error)
    } finally {
      running = false
    }
  }
  void run()
  jobs.__sniptideUsageTimer = setInterval(run, 60_000)
  jobs.__sniptideUsageTimer.unref()
}
