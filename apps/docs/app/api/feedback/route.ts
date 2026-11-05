import { z } from "zod"
import { feedbackEvent, posthogConfig, ratings } from "@/lib/feedback"

const feedbackSchema = z.object({
  rating: z.enum(ratings),
  // The page's path on this site, such as /mcp or /de/mcp.
  path: z.string().startsWith("/").max(300),
  locale: z.string().max(8),
})

// The answers to "Was this helpful?" at the end of each page. The browser posts here and the
// server forwards the event to PostHog, so the docs load no analytics script and set no cookie.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) return new Response(null, { status: 400 })

  const posthog = posthogConfig()
  if (!posthog) return new Response(null, { status: 204 })

  const response = await fetch(`${posthog.host}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedbackEvent(parsed.data, posthog.key, crypto.randomUUID())),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null)

  return new Response(null, { status: response?.ok ? 204 : 502 })
}
