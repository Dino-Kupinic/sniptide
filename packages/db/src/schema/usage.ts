import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

export const accountUsage = pgTable(
  "account_usage",
  {
    ownerId: text("owner_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    storageBytes: bigint("storage_bytes", { mode: "number" }).notNull().default(0),
    pasteCount: bigint("paste_count", { mode: "number" }).notNull().default(0),
    fileCount: bigint("file_count", { mode: "number" }).notNull().default(0),
    collectionCount: bigint("collection_count", { mode: "number" }).notNull().default(0),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("account_usage_reconciled_idx").on(table.reconciledAt, table.ownerId)],
)

export const apiTokenUsageDay = pgTable(
  "api_token_usage_day",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id").notNull(),
    day: integer("day").notNull(),
    requests: bigint("requests", { mode: "number" }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.day, table.tokenId] })],
)
