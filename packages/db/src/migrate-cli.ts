import "dotenv/config"
import path from "node:path"
import { createDb } from "./index"
import { migrateDb } from "./migrate"

const db = createDb(
  process.env.DATABASE_URL ?? "postgres://sniptide:sniptide@localhost:5432/sniptide",
)
try {
  const report = await migrateDb(db, path.join(import.meta.dirname, "../migrations"))
  console.log(
    report.applied.length
      ? `Applied ${report.applied.length} migration(s): ${report.applied.join(", ")}`
      : "The database is up to date.",
  )
  if (report.ahead.length)
    console.warn(`The database has migrations this build doesn't know: ${report.ahead.join(", ")}`)
} finally {
  await db.$client.end()
}
