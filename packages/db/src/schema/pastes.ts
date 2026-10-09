// Paste tables behind apps/web/lib/pastes/store.ts. Column keys match the Paste, Share and
// Star shapes in apps/web/lib/pastes/types.ts, so rows map straight onto them. Timestamps are
// epoch milliseconds stored as integers.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export interface PasteFileRow {
  name: string
  language: string
  content: string
}

export interface PersonRow {
  username: string
  name: string
  initials: string
  tone: "primary" | "foreground" | "muted"
}

export const paste = sqliteTable(
  "paste",
  {
    slug: text("slug").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    files: text("files", { mode: "json" }).$type<PasteFileRow[]>().notNull(),
    visibility: text("visibility", { enum: ["public", "unlisted", "private"] }).notNull(),
    password: text("password"),
    burnAfterRead: integer("burn_after_read", { mode: "boolean" }).default(false).notNull(),
    allowRaw: integer("allow_raw", { mode: "boolean" }).default(true).notNull(),
    collection: text("collection"),
    // Null for the signed-in viewer's own pastes. Stored as JSON, so a null may land as the text
    // "null" rather than SQL NULL; the store checks for both.
    owner: text("owner", { mode: "json" }).$type<PersonRow | null>(),
    views: integer("views").default(0).notNull(),
    uniqueViews: integer("unique_views").default(0).notNull(),
    viewsByDay: text("views_by_day", { mode: "json" }).$type<number[]>().notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at"),
    deletedAt: integer("deleted_at"),
    revisions: text("revisions", { mode: "json" })
      .$type<{ message: string; createdAt: number }[]>()
      .notNull(),
  },
  (table) => [index("paste_deleted_at_idx").on(table.deletedAt)],
)

// Pastes shared with the viewer. Slug changes and deletes follow the paste through the foreign key.
export const pasteShare = sqliteTable("paste_share", {
  slug: text("slug")
    .primaryKey()
    .references(() => paste.slug, { onDelete: "cascade", onUpdate: "cascade" }),
  access: text("access", { enum: ["edit", "view"] }).notNull(),
  sharedAt: integer("shared_at").notNull(),
  seen: integer("seen", { mode: "boolean" }).default(false).notNull(),
})

export const pasteStar = sqliteTable("paste_star", {
  slug: text("slug")
    .primaryKey()
    .references(() => paste.slug, { onDelete: "cascade", onUpdate: "cascade" }),
  starredAt: integer("starred_at").notNull(),
})
