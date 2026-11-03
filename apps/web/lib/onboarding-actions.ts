"use server"

import { apiToken, oauthClient, onboarding } from "@workspace/db/schema"
import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { actionError } from "@/lib/i18n/action-errors"
import {
  type AgentClient,
  agentClientFromName,
  isSignupSourceAnswer,
  isUseCase,
} from "@/lib/onboarding"

type Result = { ok: true } | { ok: false; error: string }

// Stores where the account heard about Sniptide, or "skipped". The first answer wins, so going
// back in the wizard or a second tab never rewrites it. Writing the row also ends the redirect
// to the wizard.
export async function saveSignupSource(answer: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  if (!isSignupSourceAnswer(answer)) return { ok: false, error: await actionError("saveFailed") }

  try {
    await getDb()
      .insert(onboarding)
      .values({ userId: session.user.id, source: answer })
      .onConflictDoNothing()
  } catch {
    return { ok: false, error: await actionError("saveFailed") }
  }
  return { ok: true }
}

// Stores what the account wants to use Sniptide for. Unlike the source, a later answer replaces
// an earlier one, since going back to change it is a correction.
export async function saveUseCase(answer: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  if (!isUseCase(answer)) return { ok: false, error: await actionError("saveFailed") }

  try {
    await getDb()
      .insert(onboarding)
      .values({ userId: session.user.id, source: "skipped", useCase: answer })
      .onConflictDoUpdate({ target: onboarding.userId, set: { useCase: sql`excluded.use_case` } })
  } catch {
    return { ok: false, error: await actionError("saveFailed") }
  }
  return { ok: true }
}

// The newest agent the account connected through OAuth, so the wizard can confirm the connection
// as soon as the agent's consent screen is allowed. Null until one connects.
export async function getAgentConnection(): Promise<{ client: AgentClient } | null> {
  const session = await getSession()
  if (!session) return null
  const [row] = await getDb()
    .select({ name: oauthClient.name })
    .from(apiToken)
    .innerJoin(oauthClient, eq(apiToken.clientId, oauthClient.id))
    .where(and(eq(apiToken.ownerId, session.user.id), isNotNull(apiToken.clientId)))
    .orderBy(desc(apiToken.createdAt))
    .limit(1)
  return row ? { client: agentClientFromName(row.name) } : null
}
