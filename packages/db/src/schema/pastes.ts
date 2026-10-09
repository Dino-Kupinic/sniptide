// Pastes and everything hanging off them. Times are epoch milliseconds, like the auth tables.
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { user } from "./auth"

export const paste = sqliteTable(
  "paste",
  {
    id: text("id").primaryKey(),
    // The public link (sniptide.com/<slug>). Can change on edit; everything else points at id.
    slug: text("slug").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    visibility: text("visibility", { enum: ["public", "unlisted", "private"] }).notNull(),
    // scrypt hash ("salt:hash", hex), never the password itself.
    passwordHash: text("password_hash"),
    burnAfterRead: integer("burn_after_read", { mode: "boolean" }).notNull().default(false),
    allowRaw: integer("allow_raw", { mode: "boolean" }).notNull().default(true),
    collection: text("collection"),
    views: integer("views").notNull().default(0),
    uniqueViews: integer("unique_views").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at"),
    // Set while the paste is in the trash.
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    uniqueIndex("paste_slug_unique").on(table.slug),
    index("paste_owner_idx").on(table.ownerId, table.updatedAt),
  ],
)

export const pasteFile = sqliteTable(
  "paste_file",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pasteId: text("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    content: text("content").notNull(),
  },
  (table) => [index("paste_file_paste_idx").on(table.pasteId, table.position)],
)

export const pasteRevision = sqliteTable(
  "paste_revision",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pasteId: text("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("paste_revision_paste_idx").on(table.pasteId, table.createdAt)],
)

// Views per paste per UTC day (days since the epoch), for the charts.
export const pasteViewDay = sqliteTable(
  "paste_view_day",
  {
    pasteId: text("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    views: integer("views").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.pasteId, table.day] })],
)

export const pasteStar = sqliteTable(
  "paste_star",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pasteId: text("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pasteId] })],
)
