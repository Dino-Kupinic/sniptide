import { checkAccess } from "@/lib/pastes/access"
import { getPaste } from "@/lib/pastes/store"

// Plain-text view of one file: /<slug>/raw?file=<name>, with &download=1 to save it.
export async function GET(request: Request, { params }: RouteContext<"/[slug]/raw">) {
  const { slug } = await params
  const paste = await getPaste(slug)
  const access = await checkAccess(paste)

  if (!paste || access.status === "missing") return new Response("Not found", { status: 404 })
  if (access.status === "locked")
    return new Response("This paste is password protected", { status: 401 })
  if (!paste.allowRaw && !access.signedIn)
    return new Response("Raw access is off for this paste", { status: 403 })

  const url = new URL(request.url)
  const name = url.searchParams.get("file")
  const file = paste.files.find((candidate) => candidate.name === name) ?? paste.files[0]
  if (!file) return new Response("Not found", { status: 404 })

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
