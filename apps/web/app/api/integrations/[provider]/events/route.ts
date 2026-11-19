import { handleSlackEvent } from "@/lib/integrations/slack-unfurl"

export const dynamic = "force-dynamic"

// Events a connected service sends to Sniptide. Only Slack sends any, for link previews.
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/integrations/[provider]/events">,
) {
  if ((await params).provider !== "slack") return new Response("Not found", { status: 404 })
  return handleSlackEvent(request)
}
