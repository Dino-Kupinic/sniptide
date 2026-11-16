import { handleCallback } from "@/lib/integrations/callback"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/integrations/[provider]/callback">,
) {
  return handleCallback((await params).provider, request)
}
