import "server-only"

import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { createDb, type Database } from "@workspace/db"

// One libSQL client for the whole server process. Kept on globalThis so `next dev` reloads
// don't open a new connection on every edit.
const globalDb = globalThis as typeof globalThis & { __sniptideDb?: Database }

export function getDb() {
  if (!globalDb.__sniptideDb) {
    const url = process.env.DATABASE_URL ?? "file:./data/sniptide.db"
    // SQLite creates the file but not its folder (data/ on a fresh clone).
    if (url.startsWith("file:")) mkdirSync(dirname(url.slice("file:".length)), { recursive: true })
    globalDb.__sniptideDb = createDb(url, process.env.DATABASE_AUTH_TOKEN)
  }
  return globalDb.__sniptideDb
}
