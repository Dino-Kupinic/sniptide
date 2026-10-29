// Where a new account says it heard about Sniptide: one optional answer per account, kept so
// each launch channel can be measured against the agents it brings in.
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const signupSource = pgTable("signup_source", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // One of SIGNUP_SOURCES (apps/web/lib/signup-source.ts), or "skipped" when the account
  // dismissed the question.
  source: text("source").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
})
