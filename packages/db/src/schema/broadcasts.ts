// Emails to subscribers: who opted in, to which kinds, and the address their contact at the email provider uses.
// A row exists exactly while the account wants these emails. Keeping the address lets an email
// change or account deletion find the contact to move or remove.
import { sql } from "drizzle-orm"
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const broadcastSubscription = pgTable("broadcast_subscription", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  // The kinds of email the account turned on: "update", "survey" and "guide"
  // (@workspace/email/topics). Rows from before the choice existed hold only "update", the kind
  // their owners agreed to.
  topics: text("topics").array().notNull().default(sql`ARRAY['update']::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// An email to subscribers written in the admin app (apps/admin): a draft until it is sent, then a
// read-only record of what went out. The body is Markdown that the branded broadcast layout
// renders. The app itself never reads this table.
export const broadcast = pgTable("broadcast", {
  id: text("id").primaryKey(),
  // Which template the email uses: "update", "survey" or "guide" (apps/admin/lib/kinds.ts).
  kind: text("kind").notNull().default("update"),
  subject: text("subject").notNull().default(""),
  preview: text("preview").notNull().default(""),
  label: text("label").notNull().default(""),
  imageUrl: text("image_url"),
  body: text("body").notNull().default(""),
  // The fields only some templates use, such as a survey's link and question.
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Set once the broadcast is handed to the email provider; a sent broadcast can't be edited.
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerId: text("provider_id"),
  recipients: integer("recipients"),
})
