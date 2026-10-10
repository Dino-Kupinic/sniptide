import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type { Database } from "./index"

// Startup and the CLI share a transaction lock. Acquire it before Drizzle reads
// migration state; all work stays on the transaction's connection, even with a pool of one.
export const MIGRATION_LOCK = 0x5e1d_7a1e

export async function migrateDb(db: Database, migrationsFolder: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`)
    await migrate(tx, { migrationsFolder })
  })
}
