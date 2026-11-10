import { getSession } from "@/lib/auth"
import { isSameOrigin } from "@/lib/env/http"
import { BodyTooLargeError, readBody } from "@/lib/request-body"
import { submitReport } from "@/lib/support/intake"
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_SCREENSHOT_BYTES,
  REPORT_KINDS,
  type ReportKind,
  SCREENSHOT_TYPES,
} from "@/lib/support/report"
import { deploymentVersion, instanceType, noStore } from "@/lib/support/server"

export const dynamic = "force-dynamic"

// The form, a screenshot and some room for the multipart boundaries.
const MAX_BODY_BYTES = MAX_SCREENSHOT_BYTES + 64 * 1024

function fail(status: number, error: string, headers?: HeadersInit) {
  return Response.json({ ok: false, error }, { status, headers: { ...noStore, ...headers } })
}

// Files a bug report or feedback from the in-app dialog in Linear. The dialog shows the person
// every field it sends; the account and the release come from the server, not the form.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "forbidden")
  const session = await getSession()
  if (!session) return fail(401, "unauthorized")

  let form: FormData
  try {
    // Read with a cap first: formData() alone would buffer a body of any size.
    const body = await readBody(request, MAX_BODY_BYTES)
    form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData()
  } catch (error) {
    return error instanceof BodyTooLargeError ? fail(413, "too_large") : fail(400, "invalid")
  }

  const kind = form.get("kind")
  const description = form.get("description")
  const url = form.get("url")
  const browser = form.get("browser")
  const screenshot = form.get("screenshot")
  if (
    typeof kind !== "string" ||
    !REPORT_KINDS.includes(kind as ReportKind) ||
    typeof description !== "string" ||
    !description.trim() ||
    description.length > MAX_DESCRIPTION_LENGTH ||
    typeof url !== "string" ||
    url.length > 2048 ||
    typeof browser !== "string" ||
    browser.length > 512
  )
    return fail(400, "invalid")

  let file: File | undefined
  if (screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES) return fail(413, "too_large")
    if (!(SCREENSHOT_TYPES as readonly string[]).includes(screenshot.type))
      return fail(415, "unsupported_screenshot")
    file = screenshot
  }

  const result = await submitReport({
    kind: kind as ReportKind,
    description,
    context: {
      url,
      browser,
      version: deploymentVersion(),
      userId: session.user.id,
      instance: instanceType(),
    },
    screenshot: file,
  })
  if (result.ok)
    return Response.json(
      { ok: true, issue: result.issue.identifier, duplicate: result.duplicate },
      { headers: noStore },
    )
  if (result.reason === "not_configured") return fail(404, "not_configured")
  if (result.reason === "rate_limited")
    return fail(429, "rate_limited", { "retry-after": String(result.retryAfterSeconds ?? 60) })
  return fail(502, "failed")
}
