// Integrations: an external account a user connected, such as GitHub, and the OAuth tokens
// Sniptide acts on it with. Tokens are encrypted at rest (apps/web/lib/integrations/store.ts), so
// a database dump alone can't call the provider.
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

const time = (name: string) => timestamp(name, { withTimezone: true })

export const integrationConnection = pgTable(
  "integration_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The adapter's id in apps/web/lib/integrations/providers.ts, such as "github".
    provider: text("provider").notNull(),
    // The account at the provider: its stable id there, and the name Settings shows.
    accountId: text("account_id").notNull(),
    accountName: text("account_name").notNull(),
    scope: text("scope").notNull().default(""),
    // "v1:<iv>:<tag>:<ciphertext>", base64url, AES-256-GCM.
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    // Null for tokens that stay valid until they are revoked.
    accessTokenExpiresAt: time("access_token_expires_at"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  // One account per provider for each user.
  (table) => [
    uniqueIndex("integration_connection_user_provider_unique").on(table.userId, table.provider),
    // Finds the connection behind an event a service sends about one of its accounts, such as a
    // link shared in a Slack workspace.
    index("integration_connection_provider_account_idx").on(table.provider, table.accountId),
  ],
)
