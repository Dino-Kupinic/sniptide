import { timingSafeEqual } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { telemetrySnapshot } from "@/lib/telemetry"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const token = process.env.METRICS_TOKEN
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  if (!token) return new Response("Not found", { status: 404 })
  const expected = Buffer.from(token)
  const actual = Buffer.from(supplied)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return new Response("Unauthorized", { status: 401 })
  const db = getDb()
  const [database] =
    await db.execute(sql`select pg_database_size(current_database())::float8 as bytes,
    (select count(*)::int from pg_stat_activity where datname=current_database()) as connections,
    (select count(*)::int from pg_stat_activity where datname=current_database() and wait_event_type='Lock') as lock_waiters,
    (select count(*)::int from pg_stat_activity where datname=current_database() and state='active') as active_connections`)
  const [backlog] = await db.execute(
    sql`select count(*)::int as pastes from paste where deleted_at < now() - interval '30 days' or expires_at < now() - interval '30 days'`,
  )
  return Response.json(
    { ...telemetrySnapshot(), database, purgeBacklog: backlog },
    { headers: { "cache-control": "private, no-store" } },
  )
}
