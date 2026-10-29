// Personal API tokens: how the CLI, coding agents and scripts act for an account without a browser
// session. Only a SHA-256 hash of each token is stored; the token itself is shown once, when it's
// made.
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { oauthClient } from "./oauth"

const time = (name: string) => timestamp(name, { withTimezone: true })

export const apiToken = pgTable(
  "api_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The token's first characters ("snpt_k7Qe2x"), so a list can tell tokens apart.
    prefix: text("prefix").notNull(),
    // Hex SHA-256 of the whole token.
    hash: text("hash").notNull(),
    // "read", "write" or both (apps/web/lib/api/tokens.ts).
    scopes: text("scopes").array().notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    lastUsedAt: time("last_used_at"),
    expiresAt: time("expires_at"),
    // Set when an OAuth client holds the token (apps/web/lib/oauth). The access token then lives
    // an hour and the client renews it with the refresh token, whose hash is kept here.
    clientId: text("client_id").references(() => oauthClient.id, { onDelete: "cascade" }),
    refreshHash: text("refresh_hash"),
    refreshExpiresAt: time("refresh_expires_at"),
  },
  (table) => [
    uniqueIndex("api_token_hash_unique").on(table.hash),
    uniqueIndex("api_token_refresh_hash_unique").on(table.refreshHash),
    index("api_token_owner_idx").on(table.ownerId, table.createdAt),
  ],
)
