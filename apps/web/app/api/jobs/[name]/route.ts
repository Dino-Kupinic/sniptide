import { isJobName, runJob } from "@/lib/jobs"
import { operationsAuthFailure } from "@/lib/operations-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const denied = operationsAuthFailure(request)
  if (denied) return denied
  const { name } = await params
  const headers = { "cache-control": "private, no-store" }
  if (!isJobName(name))
    return Response.json({ error: "Unknown maintenance job." }, { status: 404, headers })
  const report = await runJob(name)
  const status = report.outcome === "failed" ? 500 : report.outcome === "busy" ? 409 : 200
  return Response.json(report, { status, headers })
}
