import "server-only"

import { apiToken } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import type { AllowanceId } from "@/lib/account/usage-display"
import { apiLimits } from "@/lib/api/http"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { limits } from "@/lib/pastes/limits"
import { type Limit, peek } from "@/lib/rate-limit"
import { questionLimit } from "@/lib/support/assistant"
import { reportLimit } from "@/lib/support/intake"

// The per-account allowances that refill on a timer, read from the same rate-limit counters that
// enforce them. Reading never counts as a hit. Allowances for features this server turned off
// (the support assistant, reports, Slack and Discord shares) are left out.

export interface Allowance {
  id: AllowanceId
  used: number
  limit: number
  windowSeconds: number
  // Seconds until the window refills, or null when nothing has been used in it.
  resetSeconds: number | null
}

export async function getAccountAllowances(owner: string): Promise<Allowance[]> {
  const config = getConfig()
  const single: [AllowanceId, Limit][] = [
    ["pasteCreates", limits.create(owner)],
    ["pasteEdits", limits.edit(owner)],
    ["gistImports", limits.gist(owner)],
  ]
  if (Object.values(config.webhooks).some(Boolean))
    single.push(["webhookShares", limits.webhook(owner)])
  single.push(
    ["secretLinks", limits.secretShare(owner)],
    ["tokenCreates", limits.tokenCreate(owner)],
  )
  // Each token has its own allowance, so the busiest one is the one that can run out.
  const tokens = await getDb()
    .select({ id: apiToken.id })
    .from(apiToken)
    .where(eq(apiToken.ownerId, owner))
  const tokenLimits = tokens.map((token) => apiLimits.request(token.id))
  const tail: [AllowanceId, Limit][] = []
  if (config.support.assistant) tail.push(["assistantQuestions", questionLimit(owner)])
  if (config.support.linear) tail.push(["reports", reportLimit(owner)])

  const uses = await peek([...single, ...tail].map(([, limit]) => limit).concat(tokenLimits))
  const allowance = (id: AllowanceId, limit: Limit): Allowance => {
    const use = uses.get(limit.key)
    return {
      id,
      used: use?.count ?? 0,
      limit: limit.max,
      windowSeconds: Number(limit.windowSeconds),
      resetSeconds: use?.resetSeconds ?? null,
    }
  }
  const idle = apiLimits.request("")
  const busiest = tokenLimits
    .map((limit) => allowance("apiRequests", limit))
    .reduce<Allowance>((top, next) => (next.used > top.used ? next : top), {
      id: "apiRequests",
      used: 0,
      limit: idle.max,
      windowSeconds: Number(idle.windowSeconds),
      resetSeconds: null,
    })
  return [
    ...single.map(([id, limit]) => allowance(id, limit)),
    busiest,
    ...tail.map(([id, limit]) => allowance(id, limit)),
  ]
}
