import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// Reports belong to the restricted operations queue, independently of paste/account deletion.
// They never contain evidence attachments or a copied paste snapshot.
export const abuseReport = pgTable(
  "abuse_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deduplicationKey: text("deduplication_key").notNull().unique(),
    target: text("target").notNull(),
    pasteId: uuid("paste_id"),
    category: text("category").notNull(),
    explanation: text("explanation").notNull(),
    contact: text("contact").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    outcome: text("outcome"),
    decisionCommandId: uuid("decision_command_id"),
  },
  (table) => [index("abuse_report_queue_idx").on(table.resolvedAt, table.createdAt)],
)

export const abuseReviewEvent = pgTable("abuse_review_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id"),
  actor: text("actor").notNull(),
  operation: text("operation").notNull(),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
