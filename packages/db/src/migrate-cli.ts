import "dotenv/config"
import path from "node:path"
import { createDb } from "./index"
import { migrateDb } from "./migrate"

const db = createDb(
  process.env.DATABASE_URL ?? "postgres://sniptide:sniptide@localhost:5432/sniptide",
)
try {
  await migrateDb(db, path.join(import.meta.dirname, "../migrations"))
} finally {
  await db.$client.end()
}
