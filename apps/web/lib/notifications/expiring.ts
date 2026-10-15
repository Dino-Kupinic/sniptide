import "server-only"

import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"

// Warns the owners of pastes that will expire within a day, once per paste and expiry. Pastes
// that never lived longer than two days are left out: someone who chose "1 day" knows. Run by
// the hourly maintenance job (purge.ts). Returns how many it added.
export async function notifyExpiringPastes(now = new Date()) {
  const soon = new Date(now.getTime() + DAY)
  const added = await getDb().execute(sql`
    INSERT INTO notification (user_id, kind, paste_id, dedupe_key)
    SELECT p.owner_id, 'expiring', p.id, 'expiring:' || p.id::text || ':' || extract(epoch FROM p.expires_at)::bigint::text
    FROM paste p
    WHERE p.deleted_at IS NULL
      AND p.expires_at > ${now.toISOString()}
      AND p.expires_at <= ${soon.toISOString()}
      AND p.expires_at - p.created_at >= interval '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM notification n
        WHERE n.user_id = p.owner_id
          AND n.dedupe_key = 'expiring:' || p.id::text || ':' || extract(epoch FROM p.expires_at)::bigint::text
      )
    ORDER BY p.expires_at, p.id
    LIMIT 1000
    ON CONFLICT DO NOTHING
    RETURNING id
  `)
  return added.length
}
