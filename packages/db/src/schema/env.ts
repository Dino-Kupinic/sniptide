// Env groups: a project's environment variables, synced to and from .env files by
// `sniptide env`. Names are stored as they are; every value is encrypted at rest
// (apps/web/lib/env/crypto.ts), so a database dump alone doesn't reveal them.
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

const time = (name: string) => timestamp(name, { withTimezone: true })

export const envGroup = pgTable(
  "env_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // What the CLI names it by (`sniptide env pull my-app`). Unique per owner.
    slug: text("slug").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("env_group_owner_slug_unique").on(table.ownerId, table.slug),
    index("env_group_owner_idx").on(table.ownerId, table.updatedAt),
  ],
)

export const envVariable = pgTable(
  "env_variable",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => envGroup.id, { onDelete: "cascade" }),
    // Order in the .env file it came from, so a pull writes them back the same way.
    position: integer("position").notNull(),
    name: text("name").notNull(),
    // "v1:<iv>:<tag>:<ciphertext>", base64url, AES-256-GCM.
    value: text("value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.name] })],
)
