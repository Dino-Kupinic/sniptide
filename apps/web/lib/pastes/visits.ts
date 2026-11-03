import "server-only"

import { performance } from "node:perf_hooks"
import { envInteger } from "@workspace/db/config"
import { paste, pasteViewDay, pasteVisit } from "@workspace/db/schema"
import { asc, eq, inArray, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { recordNotifications } from "@/lib/notifications/record"
import { recordMaintenance, recordMetric } from "@/lib/telemetry"

const VISIT_LOCK = 0x5e1d_7a20
const INTERVAL_MS = 1000

const jobs = globalThis as typeof globalThis & {
  __sniptideVisitSchedule?: Promise<void>
  __sniptideVisitTimer?: ReturnType<typeof setInterval>
  __sniptideVisitHealth?: VisitQueueHealth
}

interface VisitQueueHealth {
  backlog: number
  oldestAgeMs: number
  sampledAt: number
  lastSuccessAt: number
  lastFailureAt: number
  failed: boolean
}

function health() {
  jobs.__sniptideVisitHealth ??= {
    backlog: 0,
    oldestAgeMs: 0,
    sampledAt: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    failed: false,
  }
  return jobs.__sniptideVisitHealth
}

export function visitQueueSnapshot() {
  const state = health()
  return {
    ...state,
    oldestAgeMs:
      state.backlog > 0 ? state.oldestAgeMs + Math.max(0, Date.now() - state.sampledAt) : 0,
  }
}

export function visitQueuePressure() {
  const state = visitQueueSnapshot()
  return (
    state.failed ||
    state.oldestAgeMs > envInteger("VISIT_QUEUE_MAX_LAG_MS", 30_000, 1000, 3_600_000) ||
    state.backlog >= envInteger("VISIT_QUEUE_MAX_BACKLOG", 10_000, 1, 1_000_000)
  )
}

async function sampleQueue(drained: boolean) {
  const limit = envInteger("VISIT_QUEUE_MAX_BACKLOG", 10_000, 1, 1_000_000)
  const [sample] = await getDb().execute<{ backlog: number; oldest: string | null }>(sql`
    SELECT count(*)::int AS backlog, min(accepted_at)::text AS oldest
    FROM (SELECT accepted_at FROM paste_visit ORDER BY accepted_at, id LIMIT ${limit}) pending`)
  const now = Date.now()
  Object.assign(health(), {
    backlog: sample?.backlog ?? 0,
    oldestAgeMs: sample?.oldest ? Math.max(0, now - new Date(sample.oldest).getTime()) : 0,
    sampledAt: now,
    lastSuccessAt: drained ? now : health().lastSuccessAt,
    failed: false,
  })
  recordMaintenance({
    visitsBacklog: health().backlog,
    visitsOldestAgeMs: health().oldestAgeMs,
    visitsLastSuccessAt: health().lastSuccessAt,
    visitsSampledAt: now,
    visitsFailed: false,
  })
}

function crossedMilestones(before: number, after: number) {
  const counts: number[] = []
  for (let power = 10; power <= after; power *= 10) {
    for (const count of [power, power * 5]) {
      if (count > before && count <= after) counts.push(count)
    }
  }
  return counts
}

export async function drainVisits(options: { batchSize?: number } = {}) {
  const started = performance.now()
  const batchSize = options.batchSize ?? envInteger("VISIT_DRAIN_BATCH_SIZE", 500, 1, 5000)
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new RangeError("Visit drain batch size must be between 1 and 5000.")
  }
  try {
    const result = await getDb().transaction(async (tx) => {
      const [lock] = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(${VISIT_LOCK}) AS locked`,
      )
      if (!lock?.locked) return null
      const pending = await tx
        .select()
        .from(pasteVisit)
        .orderBy(asc(pasteVisit.acceptedAt), asc(pasteVisit.id))
        .limit(batchSize)
      const grouped = new Map<string, { total: number; days: Map<number, number> }>()
      for (const visit of pending) {
        let group = grouped.get(visit.pasteId)
        if (!group) {
          group = { total: 0, days: new Map() }
          grouped.set(visit.pasteId, group)
        }
        group.total++
        group.days.set(visit.day, (group.days.get(visit.day) ?? 0) + 1)
      }
      for (const [pasteId, group] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
        const [updated] = await tx
          .update(paste)
          .set({
            views: sql`${paste.views} + ${group.total}`,
            uniqueViews: sql`${paste.uniqueViews} + ${group.total}`,
          })
          .where(eq(paste.id, pasteId))
          .returning({ ownerId: paste.ownerId, views: paste.views })
        if (!updated) continue
        for (const [day, views] of [...group.days].sort(([a], [b]) => a - b)) {
          await tx
            .insert(pasteViewDay)
            .values({ pasteId, day, views })
            .onConflictDoUpdate({
              target: [pasteViewDay.pasteId, pasteViewDay.day],
              set: { views: sql`${pasteViewDay.views} + ${views}` },
            })
        }
        await recordNotifications(
          tx,
          crossedMilestones(updated.views - group.total, updated.views).map((count) => ({
            userId: updated.ownerId,
            kind: "views" as const,
            pasteId,
            count,
            dedupeKey: `views:${pasteId}:${count}`,
          })),
        )
      }
      if (pending.length) {
        await tx.delete(pasteVisit).where(
          inArray(
            pasteVisit.id,
            pending.map((row) => row.id),
          ),
        )
      }
      return { consumed: pending.length, pastes: grouped.size }
    })
    await sampleQueue(result !== null)
    recordMetric("maintenance:visits", performance.now() - started)
    return result
  } catch (error) {
    Object.assign(health(), { failed: true, lastFailureAt: Date.now() })
    recordMaintenance({ visitsFailed: true, visitsLastFailureAt: health().lastFailureAt })
    recordMetric("maintenance:visits", performance.now() - started, true)
    throw error
  }
}

export function scheduleVisitDrain(runDrain: typeof drainVisits = drainVisits): Promise<void> {
  if (jobs.__sniptideVisitSchedule) return jobs.__sniptideVisitSchedule
  jobs.__sniptideVisitSchedule = (async () => {
    await runDrain()
    let running = false
    jobs.__sniptideVisitTimer = setInterval(async () => {
      if (running) return
      running = true
      try {
        await runDrain()
      } catch (error) {
        console.error("Visit drain failed", error)
      } finally {
        running = false
      }
    }, INTERVAL_MS)
    jobs.__sniptideVisitTimer.unref()
  })().catch((error) => {
    jobs.__sniptideVisitSchedule = undefined
    throw error
  })
  return jobs.__sniptideVisitSchedule
}
