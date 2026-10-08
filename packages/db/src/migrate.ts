import { migrate } from "drizzle-orm/libsql/migrator"
import type { Database } from "./index"

// Applies the SQL migrations in `migrationsFolder` that this database hasn't seen yet.
export async function migrateDb(db: Database, migrationsFolder: string) {
  // WAL lets readers keep going while a write happens; busy_timeout waits out short locks
  // instead of failing with SQLITE_BUSY.
  await db.$sqlite.execute("PRAGMA journal_mode = WAL")
  await db.$sqlite.execute("PRAGMA busy_timeout = 5000")
  await db.$sqlite.execute("PRAGMA foreign_keys = ON")
  await migrate(db, { migrationsFolder })
}
