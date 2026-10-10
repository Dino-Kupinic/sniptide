// Counters behind the app's own rate limits (see apps/web/lib/rate-limit.ts). Better Auth keeps
// its own for sign-in (authRateLimit below); these cover the routes it doesn't, like unlocking a
// paste.
import { bigint, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const rateLimit = pgTable(
  "rate_limit",
  {
    // What is being limited, like "unlock:paste:<slug>".
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    count: integer("count").notNull(),
  },
  (table) => [index("rate_limit_window_idx").on(table.windowStart)],
)

// Better Auth's rate-limit model (rateLimit.storage "database", modelName "authRateLimit").
export const authRateLimit = pgTable(
  "auth_rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    // Epoch milliseconds of the window's last request.
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [index("auth_rate_limit_window_idx").on(table.lastRequest)],
)
