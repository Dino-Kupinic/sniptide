import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { jobStatus } from "@/lib/jobs"
import { operationsAuthFailure } from "@/lib/operations-auth"
import { telemetrySnapshot } from "@/lib/telemetry"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const denied = operationsAuthFailure(request)
  if (denied) return denied
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
    { ...telemetrySnapshot(), database, purgeBacklog: backlog, maintenanceJobs: jobStatus() },
    { headers: { "cache-control": "private, no-store" } },
  )
}
