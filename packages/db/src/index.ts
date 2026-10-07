import type { D1Database } from "@cloudflare/workers-types"
import { drizzle } from "drizzle-orm/d1"
import { relations } from "./schema"

export function createDb(d1: D1Database) {
  return drizzle(d1, { relations })
}

export type Database = ReturnType<typeof createDb>
