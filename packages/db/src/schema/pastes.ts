// Pastes and everything hanging off them.
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { folder } from "./folders"

export const moderationState = pgEnum("moderation_state", [
  "pending",
  "allowed",
  "quarantined",
  "removed",
])

export const visibility = pgEnum("visibility", ["public", "unlisted", "private"])

const time = (name: string) => timestamp(name, { withTimezone: true })

// Where captured code came from, recorded by the CLI (`sniptide push`). `dirty` marks code that
// differs from the recorded commit.
export interface PasteSource {
  repository: string | null
  commit: string | null
  dirty: boolean
}

// What a revision restores: the paste's title, description and files as they were when it was
// saved. Sharing settings, the link and the collection are not part of it.
export interface RevisionSnapshot {
  title: string
  description: string
  files: {
    name: string
    language: string
    content: string
    startLine?: number | null
    endLine?: number | null
  }[]
}

export const paste = pgTable(
  "paste",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moderationState: moderationState("moderation_state").notNull().default("allowed"),
    moderationVersion: bigint("moderation_version", { mode: "number" }).notNull().default(0),
    // The public link (sniptide.com/<slug>). Can change on edit; everything else points at id.
    slug: text("slug").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    bytes: integer("bytes").notNull().default(0),
    visibility: visibility("visibility").notNull(),
    // scrypt hash ("salt:hash", hex), never the password itself.
    passwordHash: text("password_hash"),
    burnAfterRead: boolean("burn_after_read").notNull().default(false),
    allowRaw: boolean("allow_raw").notNull().default(true),
    collection: text("collection"),
    // The folder the paste is filed in, if any. No cascade: a folder is never deleted while
    // pastes still point at it, so deleting one can't silently take pastes with it.
    folderId: uuid("folder_id").references(() => folder.id),
    // Free-form labels for finding a paste again (`sniptide list --tag react`).
    tags: text("tags").array().notNull().default([]),
    source: jsonb("source").$type<PasteSource>(),
    views: integer("views").notNull().default(0),
    uniqueViews: integer("unique_views").notNull().default(0),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    version: bigint("version", { mode: "number" })
      .notNull()
      .default(sql`floor(extract(epoch from clock_timestamp()) * 1000)`),
    expiresAt: time("expires_at"),
    // Set while the paste is in the trash.
    deletedAt: time("deleted_at"),
  },
  (table) => [
    uniqueIndex("paste_slug_unique").on(table.slug),
    index("paste_owner_idx").on(table.ownerId, table.updatedAt),
    index("paste_collection_idx").on(table.ownerId, table.collection, table.updatedAt, table.id),
    index("paste_folder_idx").on(table.ownerId, table.folderId, table.updatedAt, table.id),
    index("paste_deleted_idx").on(table.deletedAt),
    index("paste_expired_idx").on(table.expiresAt),
    index("paste_title_search_idx").using("gin", table.title.op("gin_trgm_ops")),
    index("paste_slug_search_idx").using("gin", table.slug.op("gin_trgm_ops")),
    index("paste_tags_idx").using("gin", table.tags),
  ],
)

export const pasteFile = pgTable(
  "paste_file",
  {
    id: serial("id").primaryKey(),
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    content: text("content").notNull(),
    // The source lines a capture took, 1-based and inclusive. Null for a whole file.
    startLine: integer("start_line"),
    endLine: integer("end_line"),
  },
  (table) => [index("paste_file_paste_idx").on(table.pasteId, table.position)],
)

export const pasteRevision = pgTable(
  "paste_revision",
  {
    id: serial("id").primaryKey(),
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    // Set when the editor is closed with Done: the next edit starts a new revision instead of
    // folding into this one.
    sealed: boolean("sealed").notNull().default(false),
    // Null for revisions made before snapshots were kept and for ones pruned from a long history.
    snapshot: jsonb("snapshot").$type<RevisionSnapshot>(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [index("paste_revision_paste_idx").on(table.pasteId, table.createdAt)],
)

// Views per paste per UTC day (days since the epoch), for the charts.
export const pasteViewDay = pgTable(
  "paste_view_day",
  {
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    views: integer("views").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.pasteId, table.day] }),
    index("paste_view_day_retention_idx").on(table.day, table.pasteId),
  ],
)

export const pasteStar = pgTable(
  "paste_star",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.pasteId] }),
    index("paste_star_paste_idx").on(table.pasteId),
  ],
)

export const shareAccess = pgEnum("share_access", ["view", "edit"])

// A paste its owner invited another account to. Removing the row revokes access, whether the
// owner removes the person or the person leaves.
export const pasteShare = pgTable(
  "paste_share",
  {
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    access: shareAccess("access").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    // When the person first opened it; null keeps it marked as new in Shared with me.
    seenAt: time("seen_at"),
    // When the person removed it from their Shared with me. The row stays so Undo is instant, but
    // a paste they left gives them no access; the owner inviting them again clears it.
    leftAt: time("left_at"),
  },
  (table) => [
    primaryKey({ columns: [table.pasteId, table.userId] }),
    index("paste_share_user_idx").on(table.userId, table.createdAt),
  ],
)

export const moderationEvent = pgTable(
  "moderation_event",
  {
    commandId: uuid("command_id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    pasteId: uuid("paste_id").notNull(),
    actor: text("actor").notNull(),
    fromState: moderationState("from_state").notNull(),
    toState: moderationState("to_state").notNull(),
    reasonCode: text("reason_code").notNull(),
    caseReference: uuid("case_reference").notNull(),
    contentVersion: bigint("content_version", { mode: "number" }).notNull(),
    moderationVersion: bigint("moderation_version", { mode: "number" }).notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [index("moderation_event_paste_idx").on(table.pasteId, table.createdAt)],
)
