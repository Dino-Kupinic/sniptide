import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { envInteger } from "./config"
import { relations } from "./schema"

// Postgres through postgres.js. DATABASE_URL is a regular connection string
// (postgres://user:password@host:5432/sniptide).
export function createDb(url: string) {
  const client = postgres(url, {
    max: envInteger("DATABASE_POOL_SIZE", 10, 1, 100),
    connect_timeout: envInteger("DATABASE_CONNECT_TIMEOUT_SECONDS", 10, 1, 120),
    idle_timeout: envInteger("DATABASE_IDLE_TIMEOUT_SECONDS", 20, 1, 3600),
    max_lifetime: envInteger("DATABASE_MAX_LIFETIME_SECONDS", 1800, 60, 86400),
    connection: {
      application_name: "sniptide",
      statement_timeout: envInteger("DATABASE_STATEMENT_TIMEOUT_MS", 10000, 100, 300000),
      lock_timeout: envInteger("DATABASE_LOCK_TIMEOUT_MS", 3000, 100, 300000),
      idle_in_transaction_session_timeout: envInteger(
        "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS",
        15000,
        100,
        300000,
      ),
    },
  })
  return Object.assign(drizzle({ client, relations }), { $client: client })
}

export type Database = ReturnType<typeof createDb>
