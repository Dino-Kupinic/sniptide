import { readSharedPaste } from "@/lib/pastes/store"
import { retryAfterSeconds } from "@/lib/public-limits"

// Hands a burn-after-read paste to the visitor who asked for it, once. Only a POST reveals it, so
// link previews and scanners that fetch the share page can't burn it before the reader does.
// A route handler for the same reason as the unlock route: on sniptide.com the page is proxied.
export async function POST(request: Request, { params }: RouteContext<"/[slug]/reveal">) {
  const headers = { "cache-control": "private, no-store" }
  // Checked before the paste is read, so a refused request never burns it.
  const retryAfter = await retryAfterSeconds(request, "reveal")
  if (retryAfter) {
    return Response.json(
      { ok: false, error: "Too many requests. Try again in a minute." },
      { status: 429, headers: { ...headers, "retry-after": String(retryAfter) } },
    )
  }

  const { slug } = await params
  const read = await readSharedPaste(slug, { reveal: true })

  if (read.status === "locked")
    return Response.json({ ok: false, error: "Unlock the paste first." }, { status: 401, headers })
  if (read.status !== "ok")
    return Response.json(
      { ok: false, error: "This paste is gone. Someone already read it." },
      { status: 404, headers },
    )

  const { paste } = read
  return Response.json(
    {
      ok: true,
      title: paste.title,
      files: paste.files.map(({ name, language, content }) => ({ name, language, content })),
    },
    { headers },
  )
}
