import "server-only"

import { hit, type Limit } from "@/lib/rate-limit"
import { HOUR_SECONDS } from "@/lib/time"

// Per-account limits, so one account can't fill the database or spend the server's GitHub quota.
export const limits = {
  create: (user: string): Limit => ({
    key: `paste:create:${user}`,
    max: 30,
    windowSeconds: HOUR_SECONDS,
  }),
  edit: (user: string): Limit => ({
    key: `paste:edit:${user}`,
    max: 240,
    windowSeconds: HOUR_SECONDS,
  }),
  gist: (user: string): Limit => ({
    key: `paste:gist:${user}`,
    max: 20,
    windowSeconds: HOUR_SECONDS,
  }),
  webhook: (user: string): Limit => ({
    key: `paste:webhook:${user}`,
    max: 20,
    windowSeconds: HOUR_SECONDS,
  }),
  // Looking up who to invite. Lookups are exact, but a cap still keeps anyone from testing a
  // long list of addresses for accounts.
  personLookup: (user: string): Limit => ({
    key: `paste:person-lookup:${user}`,
    max: 60,
    windowSeconds: HOUR_SECONDS,
  }),
  slugCheck: (user: string): Limit => ({
    key: `paste:slug-check:${user}`,
    max: 600,
    windowSeconds: HOUR_SECONDS,
  }),
}

// An error message when any of the checks is used up, otherwise null.
export async function limited(...checks: Limit[]) {
  const result = await hit(checks)
  if (result.allowed) return null
  const minutes = Math.ceil(result.retryAfterSeconds / 60)
  return `You're doing that too often. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}
