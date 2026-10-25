import { forwardToPostHog } from "@/lib/analytics-proxy"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path: string[] }> }

async function handle(request: Request, { params }: Context) {
  return forwardToPostHog(request, (await params).path)
}

export { handle as GET, handle as POST }
