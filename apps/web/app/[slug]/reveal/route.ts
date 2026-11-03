import { highlightFiles } from "@/lib/highlight/highlight"
import { revealSharedPaste } from "@/lib/pastes/store"
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
  const read = await revealSharedPaste(slug)

  if (read.status === "locked")
    return Response.json({ ok: false, error: "Unlock the paste first." }, { status: 401, headers })
  if (read.status !== "ok")
    return Response.json(
      { ok: false, error: "This paste is gone. Someone already read it." },
      { status: 404, headers },
    )

  // The paste after the reveal renders like any other share page, so it carries the same
  // header details and the same server-side syntax colours. Highlighting happens after the burn
  // commits; a grammar failure leaves that file plain rather than failing the reveal.
  const { paste } = read
  const files = await highlightFiles(
    paste.files.map(({ name, language, content }) => ({ name, language, content })),
  )
  return Response.json(
    {
      ok: true,
      title: paste.title,
      files,
      author: { username: paste.author.username, initials: paste.author.initials },
      updatedAt: paste.updatedAt,
      expiresAt: paste.expiresAt,
      views: paste.views,
      // Whether this reveal used the paste up.
      burned: paste.burnAfterRead,
    },
    { headers },
  )
}
