// Folders: a tree a user files their pastes in, separate from collections. A paste sits in at most
// one folder (paste.folder_id), while collections stay flat, cross-cutting groups.

import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

export const folder = pgTable(
  "folder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // null for a top-level folder. No cascade on purpose: deleting a folder decides what happens
    // to the folders and pastes inside it first (apps/web/lib/folders/store.ts), so the database
    // refuses to drop a parent that still has children.
    parentId: uuid("parent_id").references((): AnyPgColumn => folder.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Names are unique among siblings, ignoring case. Top-level folders are siblings per owner.
    uniqueIndex("folder_root_name_unique")
      .on(table.ownerId, sql`lower(${table.name})`)
      .where(sql`${table.parentId} is null`),
    uniqueIndex("folder_child_name_unique")
      .on(table.parentId, sql`lower(${table.name})`)
      .where(sql`${table.parentId} is not null`),
    index("folder_owner_idx").on(table.ownerId, table.createdAt),
  ],
)
