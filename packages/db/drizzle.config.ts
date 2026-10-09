import "dotenv/config"
import { defineConfig } from "drizzle-kit"

// `generate` only needs the schema. `migrate` and `studio` connect to DATABASE_URL (the local
// Postgres from docker-compose.yml by default). The app also applies pending migrations itself
// on startup.
export default defineConfig({
  out: "./migrations",
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://sniptide:sniptide@localhost:5432/sniptide",
  },
})
