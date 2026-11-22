import "server-only"

import { broadcast, broadcastSubscription, paste, user } from "@workspace/db/schema"
import { count, desc, gte, isNotNull, isNull } from "drizzle-orm"
import { getDb } from "./db"

const DAY = 24 * 60 * 60 * 1000

// The figures on the Overview page, read straight from the app's database on each visit.
export async function overview(now = new Date()) {
  const db = getDb()
  const since = (days: number) => new Date(now.getTime() - days * DAY)
  const total = async (query: Promise<{ value: number }[]>) => (await query)[0]?.value ?? 0
  const [accounts, week, month, pastes, subscribers, sent, recent] = await Promise.all([
    total(db.select({ value: count() }).from(user)),
    total(
      db
        .select({ value: count() })
        .from(user)
        .where(gte(user.createdAt, since(7))),
    ),
    total(
      db
        .select({ value: count() })
        .from(user)
        .where(gte(user.createdAt, since(30))),
    ),
    total(db.select({ value: count() }).from(paste).where(isNull(paste.deletedAt))),
    total(db.select({ value: count() }).from(broadcastSubscription)),
    total(db.select({ value: count() }).from(broadcast).where(isNotNull(broadcast.sentAt))),
    db
      .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(8),
  ])
  return { accounts, week, month, pastes, subscribers, sent, recent }
}
