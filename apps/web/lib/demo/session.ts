import "server-only"

import { headers } from "next/headers"
import { getAuth } from "@/lib/auth"
import { RESOLVED_IP_HEADER, withResolvedIp } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"
import { hit } from "@/lib/rate-limit"
import { seconds } from "@/lib/time"
import { DEMO_EMAIL, demoPassword } from "./guest"

// Signs the visitor in to the shared guest account (setting the session cookie). Refused with
// null when demo mode is off or the visitor's address has asked too often.
export async function enterDemo() {
  const { demoMode, authSecret } = getConfig()
  if (!demoMode || !authSecret) return null

  const requestHeaders = withResolvedIp(await headers())
  const address = requestHeaders.get(RESOLVED_IP_HEADER) ?? "unknown"
  const limit = await hit([{ key: `demo-enter:${address}`, max: 30, windowSeconds: seconds(60) }])
  if (!limit.allowed) return null

  const auth = await getAuth()
  await auth.api.signInEmail({
    body: { email: DEMO_EMAIL, password: demoPassword(authSecret) },
    headers: requestHeaders,
  })
  return true
}
