import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

import { rateLimit } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import type { Seconds } from "@/lib/time"

// Fixed-window counters in Postgres, so the limits hold across server instances and restarts. One
// atomic upsert per hit means simultaneous requests can't all slip under the limit. Old counters
// are cleared by the scheduled purge (lib/pastes/purge.ts).

export interface Limit {
  policy?: string
  key: string
  max: number
  windowSeconds: Seconds
}

export interface Quota {
  policy: string
  limit: number
  remaining: number
  resetSeconds: number
  windowSeconds: number
}

export type Hit = ({ allowed: true } | { allowed: false; retryAfterSeconds: number }) & {
  quotas: Quota[]
}

export const requestQuotas = new AsyncLocalStorage<Map<string, Quota>>()

export function quotaHeaders(quotas: Iterable<Quota>) {
  const values = [...quotas]
  return {
    "ratelimit-policy": values
      .map((q) => `"${q.policy}";q=${q.limit};w=${q.windowSeconds}`)
      .join(", "),
    ratelimit: values.map((q) => `"${q.policy}";r=${q.remaining};t=${q.resetSeconds}`).join(", "),
  }
}

// Counts one hit against every limit and says whether all of them still have room. The hit is
// counted even when it is refused, so retrying while limited doesn't earn extra attempts.
export async function hit(limits: Limit[]): Promise<Hit> {
  const db = getDb()
  let retryAfterSeconds = 0
  const quotas: Quota[] = []

  for (const { key, max, windowSeconds, policy } of limits) {
    const window = Number(windowSeconds)
    const fresh = sql`${rateLimit.windowStart} <= now() - make_interval(secs => ${window}::int)`
    const [row] = await db
      .insert(rateLimit)
      .values({ key, count: 1 })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          count: sql`CASE WHEN ${fresh} THEN 1 ELSE ${rateLimit.count} + 1 END`,
          windowStart: sql`CASE WHEN ${fresh} THEN now() ELSE ${rateLimit.windowStart} END`,
        },
      })
      .returning({
        count: rateLimit.count,
        left: sql<number>`ceil(extract(epoch from (${rateLimit.windowStart} + make_interval(secs => ${window}::int) - now())))::int`,
      })
    if (!row) throw new Error("The rate-limit counter wasn't returned.")
    if (policy) {
      const quota = {
        policy,
        limit: max,
        remaining: Math.max(0, max - row.count),
        resetSeconds: Math.max(1, row.left),
        windowSeconds: window,
      }
      quotas.push(quota)
      requestQuotas.getStore()?.set(policy, quota)
    }
    if (row.count > max) retryAfterSeconds = Math.max(retryAfterSeconds, row.left, 1)
  }

  return retryAfterSeconds > 0
    ? { allowed: false, retryAfterSeconds, quotas }
    : { allowed: true, quotas }
}

// Gives back one hit, for an attempt that turned out to be fine (a correct password).
export async function refund(limits: Limit[]) {
  const db = getDb()
  for (const { key } of limits) {
    await db
      .update(rateLimit)
      .set({ count: sql`GREATEST(${rateLimit.count} - 1, 0)` })
      .where(eq(rateLimit.key, key))
  }
}
