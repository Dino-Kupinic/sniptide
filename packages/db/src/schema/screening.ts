import { sql } from "drizzle-orm"
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { paste } from "./pastes"

const time = (name: string) => timestamp(name, { withTimezone: true })

// What automated screening found for one content version, without any paste content: the
// provider, the categories it flagged with their scores, Web Risk matches by threat type, and the
// spam heuristics that fired.
export interface ScreeningResult {
  text: {
    provider: "openai" | "mistral"
    model: string
    flagged: string[]
    scores: Record<string, number>
  } | null
  links: { checked: number; unchecked: number; threats: string[] } | null
  spam: { score: number; reasons: string[] }
  action: "none" | "review" | "quarantine"
}

// The automated screening queue: one row per shared paste, replaced whenever its content or its
// sharing changes. `contentVersion` is the paste version the row screens, so a result for an older
// version is dropped instead of applied. A row waits with `status = 'queued'` until the job picks
// it up, and a provider failure puts it back with a later `nextAttemptAt` while the paste stays
// readable (screening fails open).
export const moderationScan = pgTable(
  "moderation_scan",
  {
    pasteId: uuid("paste_id")
      .primaryKey()
      .references(() => paste.id, { onDelete: "cascade" }),
    contentVersion: bigint("content_version", { mode: "number" }).notNull(),
    status: text("status", { enum: ["queued", "done", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
    // The error class of the last failure, such as "openai: 503". Never paste content.
    lastError: text("last_error"),
    policyVersion: text("policy_version"),
    result: jsonb("result").$type<ScreeningResult>(),
    // When the current content version was queued. A retry keeps it, so the oldest waiting row
    // shows how long screening has been behind.
    queuedAt: time("queued_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("moderation_scan_due_idx").on(table.nextAttemptAt).where(sql`${table.status} = 'queued'`),
  ],
)
