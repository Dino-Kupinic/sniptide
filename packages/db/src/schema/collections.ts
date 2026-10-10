// Collections: named groups a user files their pastes under.
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const collection = pgTable(
  "collection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The URL (/collections/<slug>) and what paste.collection stores. Unique per owner and fixed
    // once made, so renaming a collection only changes its name.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // The square icon the sidebar draws beside it, and its color. Both are names the app knows
    // (apps/web/lib/collections/types.ts), not raw SVG or hex.
    icon: text("icon").notNull().default("square"),
    hue: text("hue").notNull().default("blue"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("collection_owner_slug_unique").on(table.ownerId, table.slug),
    index("collection_owner_idx").on(table.ownerId, table.createdAt),
  ],
)
