import { readRawFile } from "@/lib/pastes/store"
import { retryAfterSeconds } from "@/lib/public-limits"

// Plain-text view of one file: /<slug>/raw?file=<name>, with &download=1 to save it.
export async function GET(request: Request, { params }: RouteContext<"/[slug]/raw">) {
  const retryAfter = await retryAfterSeconds(request, "raw")
  if (retryAfter) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "retry-after": String(retryAfter), "cache-control": "private, no-store" },
    })
  }

  const { slug } = await params
  const url = new URL(request.url)
  const read = await readRawFile(slug, url.searchParams.get("file"))
  if (read.status === "missing")
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    })
  if (read.status === "locked")
    return new Response("This paste is password protected", {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    })
  if (read.status === "forbidden")
    return new Response("Raw access is off for this paste", {
      status: 403,
      headers: { "cache-control": "private, no-store" },
    })
  const { file } = read

  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  })
  if (url.searchParams.has("download")) {
    headers.set(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    )
  }

  return new Response(file.content, { headers })
}
