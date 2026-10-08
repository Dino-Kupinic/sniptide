import { getDb } from "@/lib/db"

export const dynamic = "force-dynamic"

// For Coolify's health check: the server is up and the database answers.
export async function GET() {
  try {
    await getDb().$sqlite.execute("select 1")
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
