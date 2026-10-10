import { readSharedPaste } from "@/lib/pastes/store"

// Plain-text view of one file: /<slug>/raw?file=<name>, with &download=1 to save it.
export async function GET(request: Request, { params }: RouteContext<"/[slug]/raw">) {
  const { slug } = await params
  const read = await readSharedPaste(slug)

  if (read.status === "missing") return new Response("Not found", { status: 404 })
  if (read.status === "locked")
    return new Response("This paste is password protected", { status: 401 })
  // A burn-after-read paste is only ever handed out once, by its page, so it has no raw files.
  if (read.status === "sealed")
    return new Response("This paste burns after reading, so it has no raw link", { status: 403 })
  // The owner can always download their own paste. Everyone else needs raw access to be on.
  const { paste, owned } = read
  if (!owned && !paste.allowRaw)
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
