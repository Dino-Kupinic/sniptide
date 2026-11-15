// Syntax-highlight results kept across restarts and app instances (see
// apps/web/lib/highlight/highlight.ts). A row is found by a hash of the grammar and the code, and
// holds only how long each coloured run is and which colour it has. It never holds the code, so
// nothing of a deleted, burned or private paste stays here.
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const highlightCache = pgTable(
  "highlight_cache",
  {
    key: text("key").primaryKey(),
    // One array per line: a length and a colour number for each run, in order.
    runs: jsonb("runs").$type<number[][]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("highlight_cache_created_idx").on(table.createdAt)],
)
