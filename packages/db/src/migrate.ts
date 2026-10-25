import { sql } from "drizzle-orm"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type { Database } from "./index"

// Startup and the CLI share a transaction lock. Acquire it before Drizzle reads
// migration state; all work stays on the transaction's connection, even with a pool of one.
export const MIGRATION_LOCK = 0x5e1d_7a1e

export interface MigrationReport {
  // Migrations this run applied, in order.
  applied: string[]
  // Migrations the database has that this build doesn't know: it is older than the database, for
  // example an old image started after a newer one migrated.
  ahead: string[]
}

// The names of the migrations the database has recorded, or none when it has never been migrated.
// Runs in a savepoint so a missing table can't abort the migration's transaction.
async function recordedMigrations(tx: Pick<Database, "transaction">) {
  try {
    return await tx.transaction(async (inner) => {
      const rows = await inner.execute<{ name: string | null }>(
        sql`select name from drizzle.__drizzle_migrations`,
      )
      return new Set(rows.flatMap((row) => (row.name ? [row.name] : [])))
    })
  } catch {
    return new Set<string>()
  }
}

// Applies every pending migration in ONE transaction, so an upgrade either completes or leaves the
// database exactly as it was: a migration that fails rolls back the ones before it too. That only
// holds for statements Postgres can roll back, which apps/web/test/migrations.test.ts enforces for
// every migration file (no CREATE INDEX CONCURRENTLY and the like).
export async function migrateDb(db: Database, migrationsFolder: string): Promise<MigrationReport> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5min'`)
    await tx.execute(sql`SET LOCAL lock_timeout = '60s'`)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`)
    const known = readMigrationFiles({ migrationsFolder }).flatMap((m) => (m.name ? [m.name] : []))
    const before = await recordedMigrations(tx)
    await migrate(tx, { migrationsFolder })
    const local = new Set(known)
    return {
      applied: known.filter((name) => !before.has(name)),
      ahead: [...before].filter((name) => !local.has(name)),
    }
  })
}
