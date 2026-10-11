import "server-only"

import { hit, type Limit } from "@/lib/rate-limit"

const HOUR = 60 * 60

// Per-account limits, so one account can't fill the database or spend the server's GitHub quota.
export const limits = {
  create: (user: string): Limit => ({ key: `paste:create:${user}`, max: 30, windowSeconds: HOUR }),
  edit: (user: string): Limit => ({ key: `paste:edit:${user}`, max: 240, windowSeconds: HOUR }),
  gist: (user: string): Limit => ({ key: `paste:gist:${user}`, max: 20, windowSeconds: HOUR }),
  slugCheck: (user: string): Limit => ({
    key: `paste:slug-check:${user}`,
    max: 600,
    windowSeconds: HOUR,
  }),
}

// An error message when any of the checks is used up, otherwise null.
export async function limited(...checks: Limit[]) {
  const result = await hit(checks)
  if (result.allowed) return null
  const minutes = Math.ceil(result.retryAfterSeconds / 60)
  return `You're doing that too often. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}
