import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { relations } from "./schema"

// Postgres through postgres.js. DATABASE_URL is a regular connection string
// (postgres://user:password@host:5432/sniptide).
export function createDb(url: string) {
  const client = postgres(url, { max: 10 })
  return Object.assign(drizzle({ client, relations }), { $client: client })
}

export type Database = ReturnType<typeof createDb>
