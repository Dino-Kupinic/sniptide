import "server-only"

import { createDb, type Database } from "@workspace/db"

// One Postgres pool for the whole server process. Kept on globalThis so `next dev` reloads
// don't open a new pool on every edit.
const globalDb = globalThis as typeof globalThis & { __sniptideDb?: Database }

export function getDb() {
  if (!globalDb.__sniptideDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set (see apps/web/.env.example).")
    globalDb.__sniptideDb = createDb(url)
  }
  return globalDb.__sniptideDb
}
