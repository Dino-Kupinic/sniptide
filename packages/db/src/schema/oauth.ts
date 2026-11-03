// OAuth for agent clients (apps/web/lib/oauth): clients register themselves, a signed-in user
// approves one on the consent screen, and the client trades the one-time code for a personal API
// token (api_token rows with client_id set). Codes are stored as SHA-256 hashes, like tokens.
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

const time = (name: string) => timestamp(name, { withTimezone: true })

export const oauthClient = pgTable(
  "oauth_client",
  {
    // "sntc_" plus random characters, handed out by dynamic client registration (RFC 7591).
    id: text("id").primaryKey(),
    // What the consent screen and the token list call the client, as the client registered it.
    name: text("name").notNull(),
    redirectUris: text("redirect_uris").array().notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [index("oauth_client_created_idx").on(table.createdAt)],
)

export const oauthCode = pgTable(
  "oauth_code",
  {
    // Hex SHA-256 of the code.
    hash: text("hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    // PKCE S256 challenge (RFC 7636).
    codeChallenge: text("code_challenge").notNull(),
    scopes: text("scopes").array().notNull(),
    resource: text("resource"),
    expiresAt: time("expires_at").notNull(),
  },
  (table) => [index("oauth_code_expiry_idx").on(table.expiresAt)],
)
