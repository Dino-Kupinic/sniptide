// Paste analytics: a short-lived log of hits, and the per-day rollups the Analytics page reads.
// Nothing here identifies a person. An event carries a visitor hash that is only comparable
// within one UTC day (see analyticsSalt), the referrer's host without its path, and a country
// from a CDN header when there is one.
import {
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { paste } from "./pastes"

// What a visitor did: opened the share page, read a file as plain text (a browser, curl or an
// API client), or copied the code.
export const eventKind = pgEnum("event_kind", ["view", "raw", "copy"])
export const breakdownDimension = pgEnum("breakdown_dimension", ["referrer", "country", "device"])

// One random salt per UTC day for hashing visitors. Salts older than yesterday are deleted, so
// once a day is over nobody, the operator included, can link its visitor hashes back to an
// address or a browser.
export const analyticsSalt = pgTable("analytics_salt", {
  day: integer("day").primaryKey(),
  salt: text("salt").notNull(),
})

// Where the rollup job stands: one row, id 1. Every day up to `finalizedDay` (days since the
// epoch) is complete in the rollup tables; later days are read from paste_event.
export const analyticsRollup = pgTable("analytics_rollup", {
  id: integer("id").primaryKey(),
  finalizedDay: integer("finalized_day").notNull(),
})

// Hits since the last rollup, plus two days of grace so the Analytics page can show the last
// 24 hours by the hour and compare them with the 24 before. The rollup job (apps/web
// lib/pastes/rollup.ts) deletes anything older.
export const pasteEvent = pgTable(
  "paste_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    kind: eventKind("kind").notNull(),
    // HMAC of the address and user agent under that day's salt, truncated.
    visitor: text("visitor").notNull(),
    // The referrer's host ("news.ycombinator.com"). Null for a direct visit.
    referrer: text("referrer"),
    // ISO 3166-1 alpha-2, uppercase, when the CDN in front of the app says where the request
    // came from.
    country: text("country"),
    // "desktop", "mobile" or "cli".
    device: text("device").notNull(),
  },
  (table) => [
    index("paste_event_at_idx").on(table.at),
    index("paste_event_paste_idx").on(table.pasteId, table.at),
  ],
)

// Totals per paste per UTC day (days since the epoch). `uniques` counts the day's distinct
// visitors of that paste, so a reader who comes back on another day is counted again.
export const pasteStatsDay = pgTable(
  "paste_stats_day",
  {
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    views: integer("views").notNull().default(0),
    uniques: integer("uniques").notNull().default(0),
    raw: integer("raw").notNull().default(0),
    copies: integer("copies").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.pasteId, table.day] }),
    index("paste_stats_day_retention_idx").on(table.day, table.pasteId),
  ],
)

// The same days split by referrer host (views; "" is a direct visit), country (views) and
// device (views and raw hits).
export const pasteBreakdownDay = pgTable(
  "paste_breakdown_day",
  {
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    dimension: breakdownDimension("dimension").notNull(),
    key: text("key").notNull(),
    hits: integer("hits").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pasteId, table.day, table.dimension, table.key] }),
    index("paste_breakdown_day_retention_idx").on(table.day, table.pasteId),
  ],
)
