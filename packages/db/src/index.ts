import { type Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { relations } from "./schema"

// SQLite through libSQL. In production DATABASE_URL points at a file on the server's volume
// (file:/data/sniptide.db); a libsql:// URL would work too if the data ever moves to Turso.
export function createDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken })
  return Object.assign(drizzle({ client, relations }), { $sqlite: client })
}

export type Database = ReturnType<typeof createDb>
export type { Client }
