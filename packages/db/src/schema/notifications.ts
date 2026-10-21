// What the notification bell shows: things that happened to an account's pastes while the owner
// was away.
import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { paste } from "./pastes"

// Someone shared a paste with the account; a burn-after-read paste was read; a paste is about to
// expire; a paste reached a view milestone.
export const notificationKind = pgEnum("notification_kind", [
  "shared",
  "burned",
  "expiring",
  "views",
])

export const notificationEmailStatus = pgEnum("notification_email_status", [
  "disabled",
  "pending",
  "sent",
  "skipped",
  "failed",
])

const time = (name: string) => timestamp(name, { withTimezone: true })

// A notification points at its paste and takes the title and link from it when listed, so a
// rename or a new link shows in old notifications. Deleting the paste deletes them.
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    pasteId: uuid("paste_id")
      .notNull()
      .references(() => paste.id, { onDelete: "cascade" }),
    // Who shared the paste. Null for the other kinds, and once that account is gone.
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    // The milestone a "views" notification is for.
    count: integer("count"),
    // Makes a notification happen once: "expiring" and "views" set it, so a rerun of the job or
    // a second reader at the same count doesn't add another. Null never collides.
    dedupeKey: text("dedupe_key"),
    createdAt: time("created_at").notNull().defaultNow(),
    // Null while unread.
    readAt: time("read_at"),
    inApp: boolean("in_app").notNull().default(true),
    emailStatus: notificationEmailStatus("email_status").notNull().default("disabled"),
    emailAttempts: integer("email_attempts").notNull().default(0),
    emailNextAttemptAt: time("email_next_attempt_at"),
    emailClaimToken: uuid("email_claim_token"),
    emailSentAt: time("email_sent_at"),
  },
  (table) => [
    index("notification_email_due_idx")
      .on(table.emailNextAttemptAt, table.id)
      .where(sql`${table.emailStatus} = 'pending'`),
    index("notification_user_idx").on(table.userId, table.createdAt.desc(), table.id),
    index("notification_unread_idx").on(table.userId).where(sql`${table.readAt} is null`),
    index("notification_paste_idx").on(table.pasteId),
    uniqueIndex("notification_dedupe_unique").on(table.userId, table.dedupeKey),
  ],
)
