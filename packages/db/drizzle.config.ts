import "dotenv/config"
import { defineConfig } from "drizzle-kit"

// `generate` only needs the schema. `migrate` and `studio` open DATABASE_URL, which defaults to
// the web app's local database. The app also applies pending migrations itself on startup.
export default defineConfig({
  out: "./migrations",
  schema: "./src/schema/index.ts",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:../../apps/web/data/sniptide.db",
  },
})
