import "server-only"

import { performance } from "node:perf_hooks"
import { envInteger } from "@workspace/db/config"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { notifyExpiringPastes } from "@/lib/notifications/expiring"
import { READ_RETENTION_DAYS, UNREAD_RETENTION_DAYS } from "@/lib/notifications/retention"
import { recordMaintenance, recordMetric } from "@/lib/telemetry"
import { DAY } from "@/lib/time"

export const TRASH_DAYS = 30
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
  // 180 days is what the Analytics page needs to compare 90 days with the 90 before them.
  const analyticsDay =
    Math.floor(now.getTime() / DAY) - envInteger("ANALYTICS_RETENTION_DAYS", 180, 180, 3650)
  const cutoff = new Date(now.getTime() - 30 * DAY).toISOString()
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
        const stats = await tx.execute(
          sql`DELETE FROM paste_stats_day WHERE (paste_id, day) IN (SELECT paste_id, day FROM paste_stats_day WHERE day < ${analyticsDay} ORDER BY day, paste_id LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING day`,
        )
        const breakdown = await tx.execute(
          sql`DELETE FROM paste_breakdown_day WHERE (paste_id, day, dimension, key) IN (SELECT paste_id, day, dimension, key FROM paste_breakdown_day WHERE day < ${analyticsDay} ORDER BY day, paste_id LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING day`,
        )
        const limits = await tx.execute(
          sql`DELETE FROM rate_limit WHERE key IN (SELECT key FROM rate_limit WHERE window_start < ${new Date(now.getTime() - DAY).toISOString()} ORDER BY window_start LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING key`,
        )
        const receipts = await tx.execute(
          sql`DELETE FROM api_receipt WHERE (token_id, key) IN (SELECT token_id, key FROM api_receipt WHERE expires_at < ${now.toISOString()} ORDER BY expires_at LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING key`,
        )
        const auth = await tx.execute(
          sql`DELETE FROM auth_rate_limit WHERE id IN (SELECT id FROM auth_rate_limit WHERE last_request < ${now.getTime() - DAY} ORDER BY last_request LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING id`,
        )
        const notices = await tx.execute(
          sql`DELETE FROM notification WHERE id IN (SELECT id FROM notification WHERE read_at < ${new Date(now.getTime() - READ_RETENTION_DAYS * DAY).toISOString()} OR created_at < ${new Date(now.getTime() - UNREAD_RETENTION_DAYS * DAY).toISOString()} ORDER BY created_at LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING id`,
        )
        // OAuth (lib/oauth): codes past their ten minutes, grants whose refresh token lapsed, and
        // clients that registered a day ago and hold neither, which is what an abandoned
        // registration leaves behind.
        const codes = await tx.execute(
          sql`DELETE FROM oauth_code WHERE hash IN (SELECT hash FROM oauth_code WHERE expires_at < ${now.toISOString()} ORDER BY expires_at LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING hash`,
        )
        const grants = await tx.execute(
          sql`DELETE FROM api_token WHERE id IN (SELECT id FROM api_token WHERE client_id IS NOT NULL AND refresh_expires_at < ${now.toISOString()} ORDER BY refresh_expires_at LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING id`,
        )
        const clients = await tx.execute(
          sql`DELETE FROM oauth_client WHERE id IN (SELECT id FROM oauth_client c WHERE created_at < ${new Date(now.getTime() - DAY).toISOString()} AND NOT EXISTS (SELECT 1 FROM api_token t WHERE t.client_id = c.id) AND NOT EXISTS (SELECT 1 FROM oauth_code o WHERE o.client_id = c.id) ORDER BY created_at LIMIT ${batch} FOR UPDATE SKIP LOCKED) RETURNING id`,
        )
        return {
          trashed: trashed.length,
          expired: expired.length,
          days: days.length + stats.length + breakdown.length,
          full: [
            trashed,
            expired,
            days,
            stats,
            breakdown,
            limits,
            auth,
            notices,
            receipts,
            codes,
            grants,
            clients,
          ].some((rows) => rows.length === batch),
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
    }
    try {
      await notifyExpiringPastes()
    } catch (error) {
      console.error("Expiry notifications failed", error)
    } finally {
      running = false
    }
  }
  void run()
  globalJobs.__sniptidePurgeTimer = setInterval(run, 3_600_000)
  globalJobs.__sniptidePurgeTimer.unref()
}
