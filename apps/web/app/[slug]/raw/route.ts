import { slugFromRoute } from "@/lib/pastes/links"
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

  const slug = slugFromRoute((await params).slug)
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
    // The share page is the copy search engines should index. It carries the paste's title and
    // follows the indexing rules, such as keeping new accounts' pastes out, which plain text can't.
    "x-robots-tag": "noindex",
  })
  if (url.searchParams.has("download")) {
    headers.set(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    )
  }

  return new Response(file.content, { headers })
}
