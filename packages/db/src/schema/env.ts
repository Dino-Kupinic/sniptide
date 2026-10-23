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
    project: text("project"),
    environment: text("environment", { enum: ["dev", "staging", "prod"] }),
    revision: integer("revision").notNull().default(0),
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

export const envShare = pgTable(
  "env_share",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => envGroup.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    expiresAt: time("expires_at").notNull(),
    revokedAt: time("revoked_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [index("env_share_group_idx").on(table.groupId)],
)
