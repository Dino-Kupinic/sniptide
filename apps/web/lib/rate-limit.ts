import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

import { rateLimit } from "@workspace/db/schema"
import { eq, type SQL, sql } from "drizzle-orm"
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

// The upsert that counts one hit on `key`, for a statement that already makes a round trip and
// can count in it. Returns the same `count` and `left` columns that `settle` reads.
export function countHit(key: SQL, windowSeconds: Seconds): SQL {
  const window = Number(windowSeconds)
  const fresh = sql`rate_limit.window_start <= now() - make_interval(secs => ${window}::int)`
  return sql`insert into ${rateLimit} (key, count) ${key}
    on conflict (key) do update set
      count = case when ${fresh} then 1 else rate_limit.count + 1 end,
      window_start = case when ${fresh} then now() else rate_limit.window_start end
    returning count, ceil(extract(epoch from (window_start + make_interval(secs => ${window}::int) - now())))::int as left`
}

// Turns counted hits into the verdict, and records each named quota for the response headers.
export function settle(counted: { limit: Limit; count: number; left: number }[]): Hit {
  let retryAfterSeconds = 0
  const quotas: Quota[] = []
  for (const { limit, count, left } of counted) {
    if (limit.policy) {
      const quota = {
        policy: limit.policy,
        limit: limit.max,
        remaining: Math.max(0, limit.max - count),
        resetSeconds: Math.max(1, left),
        windowSeconds: Number(limit.windowSeconds),
      }
      quotas.push(quota)
      requestQuotas.getStore()?.set(limit.policy, quota)
    }
    if (count > limit.max) retryAfterSeconds = Math.max(retryAfterSeconds, left, 1)
  }
  return retryAfterSeconds > 0
    ? { allowed: false, retryAfterSeconds, quotas }
    : { allowed: true, quotas }
}

// Counts one hit against every limit and says whether all of them still have room. The hit is
// counted even when it is refused, so retrying while limited doesn't earn extra attempts.
export async function hit(limits: Limit[]): Promise<Hit> {
  const db = getDb()
  const counted: Parameters<typeof settle>[0] = []

  for (const limit of limits) {
    const window = Number(limit.windowSeconds)
    const fresh = sql`${rateLimit.windowStart} <= now() - make_interval(secs => ${window}::int)`
    const [row] = await db
      .insert(rateLimit)
      .values({ key: limit.key, count: 1 })
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
    counted.push({ limit, ...row })
  }

  return settle(counted)
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
