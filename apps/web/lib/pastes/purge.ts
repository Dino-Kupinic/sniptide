import "server-only"

import { performance } from "node:perf_hooks"
import { envInteger } from "@workspace/db/config"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { recordMaintenance, recordMetric } from "@/lib/telemetry"
import { DAY } from "@/lib/time"

export const TRASH_DAYS = 30
export const EXPIRED_DAYS = 30
const PURGE_LOCK = 0x5e1d_7a1d
const globalJobs = globalThis as typeof globalThis & {
  __sniptidePurgeTimer?: ReturnType<typeof setInterval>
}

// Each batch commits independently. The time budget bounds a run; one in-flight batch can
// exceed it up to the database deadline. Other replicas use the same transaction lock.
export async function purgeStaleData(now = new Date()) {
  const started = performance.now()
  const budget = envInteger("PURGE_TIME_BUDGET_MS", 2000, 100, 60000)
  const batch = envInteger("PURGE_BATCH_SIZE", 500, 1, 5000)
  const retention = envInteger("VIEW_HISTORY_RETENTION_DAYS", 90, 60, 3650)
  const cutoff = new Date(now.getTime() - 30 * DAY)
  const day = Math.floor(now.getTime() / DAY) - retention
  const totals = { trashed: 0, expired: 0 }
  let history = 0
  let batches = 0
  let exhausted = false
  try {
    do {
      const result = await getDb().transaction(async (tx) => {
        const [lock] = await tx.execute<{ locked: boolean }>(
          sql`SELECT pg_try_advisory_xact_lock(${PURGE_LOCK}) AS locked`,
        )
        if (!lock?.locked) return null
        const trashed = await tx.execute(
          sql`DELETE FROM paste WHERE id IN (SELECT id FROM paste WHERE deleted_at < ${cutoff} ORDER BY deleted_at, id LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING id`,
        )
        const expired = await tx.execute(
          sql`DELETE FROM paste WHERE id IN (SELECT id FROM paste WHERE expires_at < ${cutoff} ORDER BY expires_at, id LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING id`,
        )
        const days = await tx.execute(
          sql`DELETE FROM paste_view_day WHERE (paste_id, day) IN (SELECT paste_id, day FROM paste_view_day WHERE day < ${day} ORDER BY day, paste_id LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING day`,
        )
        const limits = await tx.execute(
          sql`DELETE FROM rate_limit WHERE key IN (SELECT key FROM rate_limit WHERE window_start < ${new Date(now.getTime() - DAY)} ORDER BY window_start LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING key`,
        )
        const auth = await tx.execute(
          sql`DELETE FROM auth_rate_limit WHERE id IN (SELECT id FROM auth_rate_limit WHERE last_request < ${now.getTime() - DAY} ORDER BY last_request LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING id`,
        )
        return {
          trashed: trashed.length,
          expired: expired.length,
          days: days.length,
          full: [trashed, expired, days, limits, auth].some((rows) => rows.length === batch),
        }
      })
      if (!result) return batches ? totals : null
      batches++
      totals.trashed += result.trashed
      totals.expired += result.expired
      history += result.days
      if (!result.full) {
        exhausted = true
        break
      }
    } while (performance.now() - started < budget)
    return totals
  } finally {
    const durationMs = performance.now() - started
    recordMetric("maintenance:purge", durationMs)
    recordMaintenance({
      lastRunAt: Date.now(),
      durationMs,
      batches,
      ...totals,
      historyRows: history,
      exhausted,
    })
    console.info(
      JSON.stringify({
        event: "purge",
        durationMs,
        batches,
        ...totals,
        historyRows: history,
        exhausted,
      }),
    )
  }
}

export function schedulePurge() {
  if (globalJobs.__sniptidePurgeTimer) return
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await purgeStaleData()
    } catch (error) {
      console.error("Paste purge failed", error)
    } finally {
      running = false
    }
  }
  void run()
  globalJobs.__sniptidePurgeTimer = setInterval(run, 3_600_000)
  globalJobs.__sniptidePurgeTimer.unref()
}
