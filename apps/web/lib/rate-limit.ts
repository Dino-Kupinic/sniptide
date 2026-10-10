import "server-only"

import { rateLimit } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"

// Fixed-window counters in Postgres, so the limits hold across server instances and restarts. One
// atomic upsert per hit means simultaneous requests can't all slip under the limit. Old counters
// are cleared by the scheduled purge (lib/pastes/purge.ts).

export interface Limit {
  key: string
  max: number
  windowSeconds: number
}

export type Hit = { allowed: true } | { allowed: false; retryAfterSeconds: number }

// Counts one hit against every limit and says whether all of them still have room. The hit is
// counted even when it is refused, so retrying while limited doesn't earn extra attempts.
export async function hit(limits: Limit[]): Promise<Hit> {
  const db = getDb()
  let retryAfterSeconds = 0

  for (const { key, max, windowSeconds } of limits) {
    const fresh = sql`${rateLimit.windowStart} <= now() - make_interval(secs => ${windowSeconds}::int)`
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
        left: sql<number>`ceil(extract(epoch from (${rateLimit.windowStart} + make_interval(secs => ${windowSeconds}::int) - now())))::int`,
      })
    if (row && row.count > max) retryAfterSeconds = Math.max(retryAfterSeconds, row.left, 1)
  }

  return retryAfterSeconds > 0 ? { allowed: false, retryAfterSeconds } : { allowed: true }
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
