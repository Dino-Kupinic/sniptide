import { getSession } from "@/lib/auth"
import { approve, checkAuthorization, errorRedirect } from "@/lib/oauth/grants"
import { appOrigin, oauthPaths } from "@/lib/oauth/metadata"

export const runtime = "nodejs"

// The consent page's script asks for JSON and navigates itself (components/oauth/consent-form.tsx);
// a plain form submission gets the 303.
function respond(request: Request, location: string) {
  if (request.headers.get("accept")?.includes("application/json"))
    return Response.json({ redirect: location }, { headers: { "cache-control": "no-store" } })
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "no-store" },
  })
}

// The Origin header names this app: its configured origin, or the host the request came to.
function sameOrigin(request: Request, origin: string) {
  const sent = request.headers.get("origin")
  if (!sent) return false
  if (sent === origin) return true
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
    return !process.env.BETTER_AUTH_URL && new URL(sent).host === host
  } catch {
    return false
  }
}

// The consent form's target. Only this app's own page may post here, with the user's session, so
// another site can't approve a request on someone's behalf.
export async function POST(request: Request) {
  const origin = appOrigin(request.url)
  if (!sameOrigin(request, origin))
    return new Response("This form can only be sent from Sniptide.", { status: 403 })
  const form = new URLSearchParams(await request.text())
  const decision = form.get("decision")
  form.delete("decision")

  const check = await checkAuthorization(form, request.url)
  if (!check.ok)
    return respond(request, check.redirect ?? `${origin}${oauthPaths.authorization}?${form}`)
  const session = await getSession()
  if (!session)
    return respond(
      request,
      `${origin}/sign-in?next=${encodeURIComponent(`${oauthPaths.authorization}?${form}`)}`,
    )
  const { request: authorization } = check
  if (decision !== "allow")
    return respond(
      request,
      errorRedirect(
        authorization.redirectUri,
        origin,
        "access_denied",
        authorization.state,
        "The user didn't allow access.",
      ),
    )
  return respond(request, await approve(authorization, session.user.id, origin))
}
