import "server-only"

import { apiToken, apiTokenUsageDay, oauthClient } from "@workspace/db/schema"
import { and, desc, eq, gt, gte, isNotNull, isNull, lte, max, or, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { type AgentClient, agentClientFromName } from "@/lib/onboarding"
import { DAY } from "@/lib/time"

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

// How many days of agent requests the dashboard's activity widget shows.
export const AGENT_ACTIVITY_DAYS = 14

export interface AgentActivity {
  // One entry per UTC day, oldest first, counted from the first day of the window.
  days: { day: number; requests: number }[]
  // Requests per connected agent over the window, busiest first.
  agents: { name: string; client: AgentClient; requests: number }[]
}

// The API and MCP requests an account's OAuth-connected agents made per UTC day, from the usage
// counters every authenticated request bumps (lib/account/usage.ts). Personal tokens are left out.
export async function agentActivity(owner: string, now = new Date()): Promise<AgentActivity> {
  const today = Math.floor(now.getTime() / DAY)
  const first = today - AGENT_ACTIVITY_DAYS + 1
  const requests = sql<number>`sum(${apiTokenUsageDay.requests})::int`
  const rows = await getDb()
    .select({ day: apiTokenUsageDay.day, name: oauthClient.name, requests })
    .from(apiTokenUsageDay)
    .innerJoin(apiToken, eq(apiToken.id, apiTokenUsageDay.tokenId))
    .innerJoin(oauthClient, eq(apiToken.clientId, oauthClient.id))
    .where(
      and(
        eq(apiTokenUsageDay.ownerId, owner),
        gte(apiTokenUsageDay.day, first),
        lte(apiTokenUsageDay.day, today),
      ),
    )
    .groupBy(apiTokenUsageDay.day, oauthClient.name)
  const perDay = new Map<number, number>()
  const perAgent = new Map<string, number>()
  for (const row of rows) {
    perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.requests)
    perAgent.set(row.name, (perAgent.get(row.name) ?? 0) + row.requests)
  }
  return {
    days: Array.from({ length: AGENT_ACTIVITY_DAYS }, (_, index) => ({
      day: first + index,
      requests: perDay.get(first + index) ?? 0,
    })),
    agents: [...perAgent]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_AGENTS)
      .map(([name, requests]) => ({ name, client: agentClientFromName(name), requests })),
  }
}
