// Product update emails: who opted in, and the address their contact at the email provider uses.
// A row exists exactly while the account wants these emails. Keeping the address lets an email
// change or account deletion find the contact to move or remove.
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const broadcastSubscription = pgTable("broadcast_subscription", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
