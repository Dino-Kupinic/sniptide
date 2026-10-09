import { migrate } from "drizzle-orm/postgres-js/migrator"
import type { Database } from "./index"

// Applies the SQL migrations in `migrationsFolder` that this database hasn't seen yet.
export async function migrateDb(db: Database, migrationsFolder: string) {
  await migrate(db, { migrationsFolder })
}
