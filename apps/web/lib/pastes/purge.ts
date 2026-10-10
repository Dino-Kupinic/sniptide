import "server-only"

import { authRateLimit, paste, rateLimit } from "@workspace/db/schema"
import { lt, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"

// How long a trashed (or burned) paste stays restorable before it's deleted for good.
export const TRASH_DAYS = 30
// How long an expired paste stays in its owner's list before it's deleted for good.
export const EXPIRED_DAYS = 30
const PURGE_EVERY_MS = 3_600_000
// Any fixed number, shared by every instance, so only one of them purges at a time.
const PURGE_LOCK = 0x5e1d_7a1d

// Deletes what nobody can read any more: pastes trashed or burned more than TRASH_DAYS ago, pastes
// expired more than EXPIRED_DAYS ago (files, revisions, stars and view counts cascade), and rate
// limit counters whose windows ended over a day ago. Returns null when another instance holds the
// lock.
export async function purgeStaleData(now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(${PURGE_LOCK}) AS locked`,
    )
    if (!lock?.locked) return null

    const trashed = await tx
      .delete(paste)
      .where(lt(paste.deletedAt, new Date(now.getTime() - TRASH_DAYS * DAY)))
      .returning({ id: paste.id })
    const expired = await tx
      .delete(paste)
      .where(lt(paste.expiresAt, new Date(now.getTime() - EXPIRED_DAYS * DAY)))
      .returning({ id: paste.id })
    await tx.delete(rateLimit).where(lt(rateLimit.windowStart, new Date(now.getTime() - DAY)))
    await tx.delete(authRateLimit).where(lt(authRateLimit.lastRequest, now.getTime() - DAY))
    return { trashed: trashed.length, expired: expired.length }
  })
}

// Runs the purge at startup and then hourly, without keeping the process alive.
export function schedulePurge() {
  const run = () =>
    purgeStaleData().catch((error: unknown) => console.error("Paste purge failed", error))
  void run()
  setInterval(run, PURGE_EVERY_MS).unref()
}
