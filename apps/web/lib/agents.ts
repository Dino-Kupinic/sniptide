import "server-only"

import { apiToken, oauthClient } from "@workspace/db/schema"
import { and, desc, eq, gt, isNotNull, isNull, max, or, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { type AgentClient, agentClientFromName } from "@/lib/onboarding"

// The agents an account connected through OAuth (lib/oauth), for the dashboard. Each connection
// holds an api_token row tied to the client it registered as, so the list needs no table of its
// own. A client that reconnects registers again under the same name, so rows group by name.

// The dashboard shows a short list; Settings has every token.
const MAX_AGENTS = 5

export interface ConnectedAgent {
  // The name the client registered with, which Settings shows on its token too.
  name: string
  client: AgentClient
  // When the agent last called the API or MCP server, to the minute, or null before its first call.
  lastActiveAt: number | null
  connectedAt: number
}

export async function listConnectedAgents(owner: string): Promise<ConnectedAgent[]> {
  const lastUsed = max(apiToken.lastUsedAt)
  const connected = max(apiToken.createdAt)
  const rows = await getDb()
    .select({ name: oauthClient.name, lastUsed, connected })
    .from(apiToken)
    .innerJoin(oauthClient, eq(apiToken.clientId, oauthClient.id))
    .where(
      and(
        eq(apiToken.ownerId, owner),
        isNotNull(apiToken.clientId),
        // A grant whose refresh token lapsed can't call anything again, so it no longer counts.
        or(isNull(apiToken.refreshExpiresAt), gt(apiToken.refreshExpiresAt, new Date())),
      ),
    )
    .groupBy(oauthClient.name)
    .orderBy(desc(sql`coalesce(${lastUsed}, ${connected})`), oauthClient.name)
    .limit(MAX_AGENTS)
  return rows.map((row) => ({
    name: row.name,
    client: agentClientFromName(row.name),
    lastActiveAt: row.lastUsed?.getTime() ?? null,
    connectedAt: row.connected?.getTime() ?? 0,
  }))
}
