// Pastes and everything hanging off them.
import {
  boolean,
  index,
  integer,
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

export const visibility = pgEnum("visibility", ["public", "unlisted", "private"])

const time = (name: string) => timestamp(name, { withTimezone: true })

export const paste = pgTable(
  "paste",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The public link (sniptide.com/<slug>). Can change on edit; everything else points at id.
    slug: text("slug").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    visibility: visibility("visibility").notNull(),
    // scrypt hash ("salt:hash", hex), never the password itself.
    passwordHash: text("password_hash"),
    burnAfterRead: boolean("burn_after_read").notNull().default(false),
    allowRaw: boolean("allow_raw").notNull().default(true),
    collection: text("collection"),
    views: integer("views").notNull().default(0),
    uniqueViews: integer("unique_views").notNull().default(0),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    expiresAt: time("expires_at"),
    // Set while the paste is in the trash.
    deletedAt: time("deleted_at"),
  },
  (table) => [
    uniqueIndex("paste_slug_unique").on(table.slug),
    index("paste_owner_idx").on(table.ownerId, table.updatedAt),
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
  (table) => [primaryKey({ columns: [table.pasteId, table.day] })],
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
  (table) => [primaryKey({ columns: [table.userId, table.pasteId] })],
)
