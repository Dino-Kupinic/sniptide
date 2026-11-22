// Product update emails: who opted in, and the address their contact at the email provider uses.
// A row exists exactly while the account wants these emails. Keeping the address lets an email
// change or account deletion find the contact to move or remove.
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const broadcastSubscription = pgTable("broadcast_subscription", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// A product update written in the admin app (apps/admin): a draft until it is sent, then a
// read-only record of what went out. The body is Markdown that the branded broadcast layout
// renders. The app itself never reads this table.
export const broadcast = pgTable("broadcast", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull().default(""),
  preview: text("preview").notNull().default(""),
  label: text("label").notNull().default(""),
  imageUrl: text("image_url"),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Set once the broadcast is handed to the email provider; a sent broadcast can't be edited.
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerId: text("provider_id"),
  recipients: integer("recipients"),
})
