import { type NextRequest, NextResponse } from "next/server"
import { getSession, isDemoMode } from "@/lib/auth"
import { enterDemo } from "@/lib/demo/session"

// Demo instances only (DEMO_MODE=true): signs the visitor in to the shared guest account and sends
// them on to `next` (an app path, the dashboard by default).
export async function GET(request: NextRequest) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 })

  const next = request.nextUrl.searchParams.get("next")
  const target =
    next?.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    Array.from(next).every(
      (character) => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127,
    )
      ? next
      : "/dashboard"

  if (!(await getSession()) && !(await enterDemo())) {
    return new NextResponse("Too many requests. Try again in a minute.", {
      status: 429,
      headers: { "Retry-After": "60" },
    })
  }
  // A relative Location, so the redirect stays on the public address behind a proxy.
  return new NextResponse(null, { status: 303, headers: { Location: target } })
}
