import { createDb, type Database } from "@workspace/db"
import { getConfig } from "./config"

// One small pool for the process, kept on globalThis so `next dev` reloads reuse it.
const globalDb = globalThis as typeof globalThis & { __sniptideAdminDb?: Database }

export function getDb() {
  globalDb.__sniptideAdminDb ??= createDb(getConfig().databaseUrl)
  return globalDb.__sniptideAdminDb
}
