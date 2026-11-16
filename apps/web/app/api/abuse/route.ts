import { createHmac } from "node:crypto"
import { abuseReportSchema, submitAbuseReport } from "@workspace/db/abuse"
import { abuseTarget } from "@/lib/abuse"
import { clientAddress } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { hit } from "@/lib/rate-limit"
import { BodyTooLargeError, readBody } from "@/lib/request-body"
import { HOUR_SECONDS } from "@/lib/time"

export const dynamic = "force-dynamic"
const noStore = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" }

export async function POST(request: Request) {
  const config = getConfig()
  if (!config.abuseReportsEnabled) return new Response(null, { status: 404, headers: noStore })
  if (!config.authSecret || !config.appUrl)
    return new Response(null, { status: 503, headers: noStore })
  const authSecret = config.authSecret
  const origins = [config.appUrl, config.shareUrl]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin)
  if (!origins.includes(request.headers.get("origin") ?? ""))
    return new Response(null, { status: 403, headers: noStore })
  const redirect = (status: string) =>
    new Response(null, {
      status: 303,
      headers: { ...noStore, location: `${config.appUrl}/abuse?status=${status}` },
    })
  const digest = (value: string) =>
    createHmac("sha256", authSecret).update(`abuse:${value}`).digest("hex")
  try {
    // Unknown addresses share a bucket instead of bypassing the quota. Configure CLIENT_IP_SOURCE
    // for the deployment's trusted proxy before enabling public intake.
    const quota = await hit([
      {
        key: `abuse:${digest(clientAddress(request.headers))}`,
        max: 10,
        windowSeconds: HOUR_SECONDS,
      },
    ])
    if (!quota.allowed) {
      const response = redirect("limited")
      response.headers.set("retry-after", String(quota.retryAfterSeconds))
      return response
    }
    const body = await readBody(request, 12 * 1024)
    const form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData()
    const entries = [...form.entries()]
    if (
      entries.some(
        ([key, value]) =>
          !["url", "category", "explanation", "contact"].includes(key) || typeof value !== "string",
      ) ||
      new Set(entries.map(([key]) => key)).size !== entries.length
    )
      return redirect("invalid")
    const target = abuseTarget(form.get("url"), origins)
    const parsed = abuseReportSchema.safeParse({
      target,
      category: form.get("category"),
      explanation: form.get("explanation"),
      contact: form.get("contact") ?? "",
    })
    if (!parsed.success) return redirect("invalid")
    const key = digest(
      JSON.stringify({ ...parsed.data, day: new Date().toISOString().slice(0, 10) }),
    )
    await submitAbuseReport(getDb(), parsed.data, key)
    // Neither existence nor duplicate status is exposed to anonymous reporters.
    return redirect("received")
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return new Response(null, { status: 413, headers: noStore })
    // The body, URL and validation errors can contain suspected material or private locations.
    // Do not pass the exception to telemetry or a routine log.
    return redirect("failed")
  }
}
