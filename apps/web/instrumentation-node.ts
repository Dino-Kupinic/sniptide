import path from "node:path"
import { migrateDb } from "@workspace/db/migrate"
import { getDb } from "@/lib/db"

// Brings the Postgres database up to the latest migration, so a deploy never serves code that's
// ahead of its schema. In the Docker image the migrations are copied to MIGRATIONS_DIR; in the
// repo they sit in packages/db.
export async function migrateOnStartup() {
  const folder =
    process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "../../packages/db/migrations")
  await migrateDb(getDb(), folder)
}
