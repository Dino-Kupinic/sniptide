import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { apiToken } from "./tokens"

export const apiReceipt = pgTable(
  "api_receipt",
  {
    tokenId: uuid("token_id")
      .notNull()
      .references(() => apiToken.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    response: jsonb("response").notNull().$type<unknown>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tokenId, table.key] }),
    index("api_receipt_expiry_idx").on(table.expiresAt),
  ],
)
