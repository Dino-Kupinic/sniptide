"use server"

import { type ConnectedAgent, listConnectedAgents } from "@/lib/agents"
import { getSession } from "@/lib/auth"

// The signed-in account's connected agents, so the dashboard can confirm a new connection and
// refresh last activity without a reload. Empty when signed out.
export async function getConnectedAgents(): Promise<ConnectedAgent[]> {
  const session = await getSession()
  if (!session) return []
  return listConnectedAgents(session.user.id)
}
