import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import type { Database } from "@workspace/db"
import { accountActivityDay, instanceActivity } from "@workspace/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { runMaintenanceWork } from "@/lib/request-admission"
import { DAY } from "@/lib/time"

type Writer = Pick<Database, "insert" | "update">
export type ActivitySurface = "web" | "api" | "cli" | "mcp"
export const activitySurface = new AsyncLocalStorage<ActivitySurface>()

export async function configureActivityTracking() {
  const config = getConfig()
  const enabled = config.instanceTelemetry.enabled && !config.demoMode
  await getDb()
    .update(instanceActivity)
    .set({ tracking: enabled, observedSinceDay: Math.floor(Date.now() / DAY) })
    .where(and(eq(instanceActivity.id, 1), eq(instanceActivity.tracking, !enabled)))
}

// Called only after an authorized operation succeeds. Mutation callers use their transaction,
// so a rollback cannot activate an installation or count a failed edit.
export async function recordAccountActivity(
  db: Writer,
  ownerId: string,
  operation: "creates" | "edits" | "reads",
  surface: ActivitySurface = activitySurface.getStore() ?? "api",
  now = new Date(),
) {
  const config = getConfig()
  if (!config.instanceTelemetry?.enabled || config.demoMode) return
  const day = Math.floor(now.getTime() / DAY)
  await db
    .insert(accountActivityDay)
    .values({ ownerId, day, surface, [operation]: 1 })
    .onConflictDoUpdate({
      target: [accountActivityDay.ownerId, accountActivityDay.day, accountActivityDay.surface],
      set: { [operation]: sql`${accountActivityDay[operation]} + 1` },
    })
  if (operation === "creates")
    await db
      .update(instanceActivity)
      .set({ activationDay: day })
      .where(and(eq(instanceActivity.id, 1), isNull(instanceActivity.activationDay)))
}

// Reads use a bounded one-second buffer, so opening a paste adds no synchronous database write.
const readState = globalThis as typeof globalThis & {
  __sniptideAccountReads?: {
    pending: Map<string, { ownerId: string; surface: ActivitySurface; at: Date; count: number }>
    timer?: ReturnType<typeof setInterval>
    flushing?: Promise<void>
  }
}
readState.__sniptideAccountReads ??= { pending: new Map() }
const reads = readState.__sniptideAccountReads
export function recordAccountRead(
  ownerId: string,
  surface: ActivitySurface = activitySurface.getStore() ?? "api",
) {
  const config = getConfig()
  if (!config.instanceTelemetry?.enabled || config.demoMode) return
  const at = new Date()
  const key = JSON.stringify([ownerId, Math.floor(at.getTime() / DAY), surface])
  const row = reads.pending.get(key)
  if (row) row.count++
  else if (reads.pending.size < 10000) reads.pending.set(key, { ownerId, surface, at, count: 1 })
  if (!reads.timer && process.env.NODE_ENV !== "test") {
    reads.timer = setInterval(() => void flushAccountReads(), 1000)
    reads.timer.unref()
  }
}
export async function flushAccountReads() {
  while (reads.flushing) await reads.flushing
  reads.flushing = (async () => {
    const batch = [...reads.pending.entries()]
    reads.pending.clear()
    const config = getConfig()
    if (!batch.length || !config.instanceTelemetry.enabled || config.demoMode) return
    try {
      await runMaintenanceWork(() =>
        getDb().execute(sql`
        insert into ${accountActivityDay} (owner_id, day, surface, reads)
        select owner_id, day, surface, reads from json_to_recordset(${JSON.stringify(
          batch.map(([, row]) => ({
            owner_id: row.ownerId,
            day: Math.floor(row.at.getTime() / DAY),
            surface: row.surface,
            reads: row.count,
          })),
        )}::text::json) as counted(owner_id text, day int, surface text, reads bigint)
        where exists (select 1 from "user" where id = counted.owner_id)
        on conflict (owner_id, day, surface) do update
        set reads = account_activity_day.reads + excluded.reads`),
      )
    } catch {
      for (const [key, row] of batch) {
        const pending = reads.pending.get(key)
        if (pending) pending.count += row.count
        else if (reads.pending.size < 10000) reads.pending.set(key, row)
      }
    }
  })().finally(() => {
    reads.flushing = undefined
  })
  await reads.flushing
}
