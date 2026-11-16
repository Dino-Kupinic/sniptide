import "server-only"

import { integrationConnection } from "@workspace/db/schema"
import { and, eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { seal, unseal } from "@/lib/sealed"
import { refreshTokens, type Tokens } from "./oauth"
import { getProvider, providers } from "./providers"

// Connections: which external accounts a user connected, and their tokens. Tokens are encrypted
// before they reach Postgres and never leave the server.

const PURPOSE = "integration-tokens:v1"
// A token this close to its end is renewed first, so it doesn't expire during the call it's for.
const EXPIRY_MARGIN = 60_000

const context = (userId: string, provider: string, kind: "access" | "refresh") =>
  `${userId}:${provider}:${kind}`

function sealTokens(userId: string, provider: string, tokens: Tokens) {
  return {
    scope: tokens.scope,
    accessToken: seal(tokens.accessToken, context(userId, provider, "access"), PURPOSE),
    refreshToken: tokens.refreshToken
      ? seal(tokens.refreshToken, context(userId, provider, "refresh"), PURPOSE)
      : null,
    accessTokenExpiresAt: tokens.expiresAt,
    updatedAt: new Date(),
  }
}

const mine = (userId: string, provider: string) =>
  and(eq(integrationConnection.userId, userId), eq(integrationConnection.provider, provider))

// Connecting again replaces the account and its tokens.
export async function saveConnection(
  userId: string,
  provider: string,
  account: { id: string; name: string },
  tokens: Tokens,
) {
  const values = {
    accountId: account.id,
    accountName: account.name,
    ...sealTokens(userId, provider, tokens),
  }
  await getDb()
    .insert(integrationConnection)
    .values({ userId, provider, ...values })
    .onConflictDoUpdate({
      target: [integrationConnection.userId, integrationConnection.provider],
      set: { ...values, createdAt: new Date() },
    })
}

// Removes the connection and returns its access token so the caller can revoke it. The token is
// null when there was no connection or its token can no longer be decrypted.
export async function removeConnection(userId: string, provider: string) {
  const [row] = await getDb()
    .delete(integrationConnection)
    .where(mine(userId, provider))
    .returning({ accessToken: integrationConnection.accessToken })
  if (!row) return null
  try {
    return unseal(row.accessToken, context(userId, provider, "access"), PURPOSE)
  } catch {
    return null
  }
}

// A token to call the provider with, renewed when it has expired. Null when the user hasn't
// connected. A connection that can't be used any more (its token doesn't decrypt after a secret
// change, or it expired and can't be renewed) is removed, so Settings shows it as not connected.
export async function accessToken(userId: string, providerId: string): Promise<string | null> {
  const [row] = await getDb().select().from(integrationConnection).where(mine(userId, providerId))
  if (!row) return null
  const provider = getProvider(providerId)
  try {
    if (!provider) throw new Error("Unknown provider.")
    const expires = row.accessTokenExpiresAt?.getTime()
    if (expires === undefined || expires - EXPIRY_MARGIN > Date.now())
      return unseal(row.accessToken, context(userId, providerId, "access"), PURPOSE)

    const credentials = provider.oauth.credentials()
    if (!row.refreshToken || !credentials) throw new Error("The token expired.")
    const stored = unseal(row.refreshToken, context(userId, providerId, "refresh"), PURPOSE)
    const tokens = await refreshTokens(provider, credentials, stored)
    if (!tokens) throw new Error("The provider refused to renew the token.")
    await getDb()
      .update(integrationConnection)
      .set(
        sealTokens(userId, providerId, {
          ...tokens,
          // Providers that don't rotate refresh tokens leave it out of the answer.
          refreshToken: tokens.refreshToken ?? stored,
        }),
      )
      .where(eq(integrationConnection.id, row.id))
    return tokens.accessToken
  } catch {
    await getDb().delete(integrationConnection).where(eq(integrationConnection.id, row.id))
    return null
  }
}

export interface IntegrationSummary {
  id: string
  name: string
  // False when the server has no OAuth app for the provider, so nobody can connect it.
  available: boolean
  connection: { account: string; connectedAt: number } | null
}

// Every provider with the user's connection to it, for Settings.
export async function listIntegrations(userId: string): Promise<IntegrationSummary[]> {
  const rows = await getDb()
    .select({
      provider: integrationConnection.provider,
      account: integrationConnection.accountName,
      connectedAt: integrationConnection.createdAt,
    })
    .from(integrationConnection)
    .where(eq(integrationConnection.userId, userId))
  return providers.map((provider) => {
    const row = rows.find((candidate) => candidate.provider === provider.id)
    return {
      id: provider.id,
      name: provider.name,
      available: provider.oauth.credentials() !== null,
      connection: row ? { account: row.account, connectedAt: row.connectedAt.getTime() } : null,
    }
  })
}
