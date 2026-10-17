import "server-only"

import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"
import { recordNotifications } from "./record"

export async function notifyExpiringPastes(now = new Date()) {
  const soon = new Date(now.getTime() + DAY)
  return getDb().transaction(async (tx) => {
    const candidates = await tx.execute<{ userId: string; pasteId: string; dedupeKey: string }>(sql`
      SELECT p.owner_id AS "userId", p.id AS "pasteId",
        'expiring:' || p.id::text || ':' || extract(epoch FROM p.expires_at)::bigint::text AS "dedupeKey"
      FROM paste p
      WHERE p.deleted_at IS NULL
        AND p.expires_at > ${now.toISOString()} AND p.expires_at <= ${soon.toISOString()}
        AND p.expires_at - p.created_at >= interval '2 days'
        AND NOT EXISTS (SELECT 1 FROM notification n WHERE n.user_id = p.owner_id
          AND n.dedupe_key = 'expiring:' || p.id::text || ':' || extract(epoch FROM p.expires_at)::bigint::text)
      ORDER BY p.expires_at, p.id LIMIT 1000
    `)
    return recordNotifications(
      tx,
      candidates.map((row) => ({ ...row, kind: "expiring" })),
    )
  })
}
