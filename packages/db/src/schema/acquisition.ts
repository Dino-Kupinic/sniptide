// What a new account told the welcome wizard: where it heard about Sniptide and what it wants to
// use it for. One row per account, kept so each launch channel can be measured against the agents
// it brings in. Both answers are optional.
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const onboarding = pgTable("onboarding", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // One of SIGNUP_SOURCES (apps/web/lib/onboarding.ts), or "skipped".
  source: text("source").notNull(),
  // One of USE_CASES (apps/web/lib/onboarding.ts), or null when the step was skipped.
  useCase: text("use_case"),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
})
