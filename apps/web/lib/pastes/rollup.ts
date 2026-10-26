import "server-only"

import { performance } from "node:perf_hooks"
import { envInteger } from "@workspace/db/config"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { recordMaintenance, recordMetric } from "@/lib/telemetry"
import { DAY, MINUTE } from "@/lib/time"
import { eventBreakdown, eventStats } from "./stats-sql"

// The scheduled half of paste analytics. Hits land in paste_event as they happen
// (lib/pastes/events.ts); this job folds them into the per-day tables that keep the history
// cheap, then lets go of the hits it no longer needs.
//
// Runs resume after the last finalized day and replace each completed day's rows, so a run that
// is repeated, interrupted or run twice at once leaves the same numbers. A day is finalized,
// and from then on read from the rollup tables only, once the run
// that rolled it up started after the day had been over for SETTLE_MS. The Analytics page reads
// the days after that straight from paste_event, so it is exact whenever it is opened and never
// waits for this job.

const ROLLUP_LOCK = 0x5e1d_7a1f
const SETTLE_MS = 5 * MINUTE
// Hits stay this many whole days back from today (today included), so the page can show the last
// 24 hours by the hour next to the 24 before.
const EVENT_DAYS = 3
const INTERVAL_MS = 15 * MINUTE

const globalJobs = globalThis as typeof globalThis & {
  __sniptideRollupTimer?: ReturnType<typeof setInterval>
}

function dayOf(time: number) {
  return Math.floor(time / DAY)
}

export async function rollUpAnalytics(now = new Date()) {
  const started = performance.now()
  const batch = envInteger("PURGE_BATCH_SIZE", 500, 1, 5000)
  const budget = envInteger("ANALYTICS_ROLLUP_TIME_BUDGET_MS", 2000, 100, 60000)
  const today = dayOf(now.getTime())
  const settled = dayOf(now.getTime() - SETTLE_MS) - 1
  let result: { days: number; removed: number } | null = { days: 0, removed: 0 }
  let nextDay: number | undefined
  try {
    do {
      const rolled = await getDb().transaction(async (tx) => {
        const [lock] = await tx.execute<{ locked: boolean }>(
          sql`SELECT pg_try_advisory_xact_lock(${ROLLUP_LOCK}) AS locked`,
        )
        if (!lock?.locked) return null
        const [state] = await tx.execute<{ finalized: number }>(
          sql`SELECT finalized_day AS finalized FROM analytics_rollup WHERE id = 1`,
        )
        let first = state ? state.finalized + 1 : null
        if (first === null) {
          const [oldest] = await tx.execute<{ day: number | null }>(
            sql`SELECT floor(extract(epoch FROM min(at)) / 86400)::int AS day FROM paste_event`,
          )
          first = Math.min(oldest?.day ?? today, today)
        }
        const day = Math.max(first, nextDay ?? first)
        if (day > today) return { day: null }
        const from = day * DAY
        const to = from + DAY
        await tx.execute(sql`
          INSERT INTO paste_stats_day (paste_id, day, views, uniques, raw, copies)
          ${eventStats(from, to)}
          ON CONFLICT (paste_id, day) DO UPDATE SET views = EXCLUDED.views,
            uniques = EXCLUDED.uniques, raw = EXCLUDED.raw, copies = EXCLUDED.copies`)
        await tx.execute(sql`
          INSERT INTO paste_breakdown_day (paste_id, day, dimension, key, hits)
          ${eventBreakdown(from, to)}
          ON CONFLICT (paste_id, day, dimension, key) DO UPDATE SET hits = EXCLUDED.hits`)
        const finalizedDay = Math.min(day, settled)
        await tx.execute(sql`
          INSERT INTO analytics_rollup (id, finalized_day) VALUES (1, ${finalizedDay})
          ON CONFLICT (id) DO UPDATE SET
            finalized_day = GREATEST(analytics_rollup.finalized_day, EXCLUDED.finalized_day)`)
        return { day }
      })
      if (!rolled) {
        if (!result.days) result = null
        break
      }
      if (rolled.day === null) break
      result.days++
      nextDay = rolled.day + 1
    } while (nextDay <= today && performance.now() - started < budget)

    while (result && performance.now() - started < budget) {
      const removed = await getDb().transaction(async (tx) => {
        const [lock] = await tx.execute<{ locked: boolean }>(
          sql`SELECT pg_try_advisory_xact_lock(${ROLLUP_LOCK}) AS locked`,
        )
        if (!lock?.locked) return null
        const [state] = await tx.execute<{ finalized: number }>(
          sql`SELECT finalized_day AS finalized FROM analytics_rollup WHERE id = 1`,
        )
        if (!state) return 0
        const cutoff = new Date(Math.min(today - EVENT_DAYS + 1, state.finalized + 1) * DAY)
        const gone = await tx.execute(sql`
          DELETE FROM paste_event WHERE id IN (
            SELECT id FROM paste_event WHERE at < ${cutoff.toISOString()}
            ORDER BY at, id LIMIT ${batch} FOR UPDATE SKIP LOCKED
          ) RETURNING id`)
        return gone.length
      })
      if (removed === null) break
      result.removed += removed
      if (removed < batch) break
    }
    if (result && performance.now() - started < budget) {
      await getDb().execute(sql`DELETE FROM analytics_salt WHERE day < ${today - 1}`)
    }
  } catch (error) {
    recordMetric("maintenance:analytics-rollup", performance.now() - started, true)
    throw error
  }

  const durationMs = performance.now() - started
  recordMetric("maintenance:analytics-rollup", durationMs)
  if (result) {
    recordMaintenance({ rollupLastRunAt: Date.now(), rollupDurationMs: durationMs, ...result })
    console.info(JSON.stringify({ event: "analytics_rollup", durationMs, ...result }))
  }
  return result
}

export function scheduleRollup() {
  if (globalJobs.__sniptideRollupTimer) return
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await rollUpAnalytics()
    } catch (error) {
      console.error("Analytics rollup failed", error)
    } finally {
      running = false
    }
  }
  void run()
  globalJobs.__sniptideRollupTimer = setInterval(run, INTERVAL_MS)
  globalJobs.__sniptideRollupTimer.unref()
}
