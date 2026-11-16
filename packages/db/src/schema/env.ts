// Env groups: a project's environment variables, synced to and from .env files by
// `sniptide env`. Names are stored as they are; every value is encrypted at rest
// (apps/web/lib/env/crypto.ts), so a database dump alone doesn't reveal them.
import {
  index,
  integer,
  jsonb,
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

// Another account's access to a group. "read" lists the names and reveals values, and "write"
// also adds, edits and deletes variables. The owner is env_group.owner_id and has no row here.
export const envMember = pgTable(
  "env_member",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => envGroup.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["read", "write"] }).notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("env_member_user_idx").on(table.userId),
  ],
)

export const ENV_AUDIT_ACTIONS = [
  "create",
  "edit",
  "delete",
  // Every value left the server at once: a token pulled the group or a protected link was opened.
  "read",
  // One value was shown, copied or loaded for editing in the app.
  "reveal",
  "link_create",
  "link_revoke",
  "grant",
  "revoke",
  "leave",
] as const

export interface EnvAuditDetail {
  // reveal: the variable. edit: every variable added, changed or removed.
  variables?: string[]
  // edit: the project or environment changed.
  settings?: boolean
  // grant, revoke: whose access changed, and to what. `person` keeps their handle as it was.
  person?: string
  personId?: string
  role?: "read" | "write"
  // via "token": the token's name, or the agent connected through OAuth.
  token?: string
}

// What happened to a group's values and access. Rows are only ever inserted: a trigger refuses
// updates, and refuses deletes while the owning account exists (see the env_audit migration).
// group_id and actor_id carry no foreign key, so an entry outlives the group it describes and
// the account that acted, and group_slug and actor keep their names as they were.
export const envAudit = pgTable(
  "env_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull(),
    groupSlug: text("group_slug").notNull(),
    action: text("action", { enum: ENV_AUDIT_ACTIONS }).notNull(),
    via: text("via", { enum: ["web", "token", "link"] }).notNull(),
    // Null when a protected link was opened, which needs no account.
    actorId: text("actor_id"),
    actor: text("actor"),
    detail: jsonb("detail").$type<EnvAuditDetail>().notNull().default({}),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("env_audit_owner_idx").on(table.ownerId, table.createdAt),
    index("env_audit_group_idx").on(table.groupId, table.createdAt),
  ],
)
