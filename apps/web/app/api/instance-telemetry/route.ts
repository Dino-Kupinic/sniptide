import { createHmac } from "node:crypto"
import { clientAddress } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"
import { reportSchema } from "@/lib/instance-telemetry"
import { hit } from "@/lib/rate-limit"
import { BodyTooLargeError, readBody } from "@/lib/request-body"
import { HOUR_SECONDS } from "@/lib/time"

const headers = { "cache-control": "private, no-store" }

export async function POST(request: Request) {
  const config = getConfig()
  // Collection belongs to the hosted service; self-hosted operators need no ingestion key.
  if (config.appUrl !== "https://app.sniptide.com" || !config.analytics || !config.authSecret)
    return new Response(null, { status: 404, headers })
  try {
    const address = createHmac("sha256", config.authSecret)
      .update(clientAddress(request.headers))
      .digest("hex")
    if (
      !(
        await hit([
          { key: `instance-telemetry:receive:${address}`, max: 60, windowSeconds: HOUR_SECONDS },
        ])
      ).allowed
    )
      return new Response(null, { status: 429, headers })
    let body: unknown
    try {
      body = JSON.parse(new TextDecoder().decode(await readBody(request, 4096)))
    } catch (error) {
      return new Response(null, { status: error instanceof BodyTooLargeError ? 413 : 400, headers })
    }
    const parsed = reportSchema.safeParse(body)
    if (!parsed.success) return new Response(null, { status: 400, headers })
    const { installation, ...properties } = parsed.data
    const response = await fetch(`${config.analytics.host}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: config.analytics.key,
        event: "self_hosted_instance_report",
        distinct_id: installation,
        properties: {
          ...properties,
          $ip: "0.0.0.0",
          $geoip_disable: true,
          $process_person_profile: false,
          surface: "self-hosted",
        },
      }),
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    })
    return new Response(null, { status: response.ok ? 204 : 503, headers })
  } catch {
    return new Response(null, { status: 503, headers })
  }
}
