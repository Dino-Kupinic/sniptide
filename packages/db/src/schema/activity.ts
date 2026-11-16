// Account identifiers stay in this database. Instance reports export aggregate counts only.
import { sql } from "drizzle-orm"
import { bigint, boolean, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const accountActivityDay = pgTable(
  "account_activity_day",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    surface: text("surface").notNull(),
    creates: bigint("creates", { mode: "number" }).notNull().default(0),
    edits: bigint("edits", { mode: "number" }).notNull().default(0),
    reads: bigint("reads", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.day, t.surface] }),
    index("account_activity_day_day_idx").on(t.day),
  ],
)

export const instanceActivity = pgTable("instance_activity", {
  id: integer("id").primaryKey(),
  observedSinceDay: integer("observed_since_day")
    .notNull()
    .default(sql`floor(extract(epoch from now()) / 86400)::int`),
  activationDay: integer("activation_day"),
  tracking: boolean("tracking").notNull().default(false),
})
