// Counters behind the app's own rate limits (see apps/web/lib/rate-limit.ts). Better Auth keeps
// its own for sign-in; these cover the routes it doesn't, like unlocking a paste.
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const rateLimit = pgTable("rate_limit", {
  // What is being limited, like "unlock:paste:<slug>".
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull(),
})
