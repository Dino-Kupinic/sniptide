import "server-only"

import { cookies } from "next/headers"
import { getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getRequestOrigin } from "@/lib/site"
import { finishAuthorization, STATE_COOKIE } from "./oauth"
import { getProvider } from "./providers"
import { saveConnection } from "./store"

// Where a provider sends the browser after the user approved or refused a connection. It always
// ends on the Integrations settings, with ?integration=<reason> when nothing was connected.
export async function handleCallback(providerId: string, request: Request): Promise<Response> {
  const origin = getConfig().appUrl ?? (await getRequestOrigin()).origin
  const jar = await cookies()
  const cookie = jar.get(STATE_COOKIE)?.value
  jar.delete(STATE_COOKIE)
  const back = (reason?: "denied" | "failed") =>
    Response.redirect(
      `${origin}/settings?tab=integrations${reason ? `&integration=${reason}` : ""}`,
      303,
    )

  const session = await getSession()
  if (!session) return Response.redirect(`${origin}/sign-in`, 303)
  const provider = getProvider(providerId)
  const credentials = provider?.oauth.credentials()
  if (!provider || !credentials) return back("failed")

  const params = new URL(request.url).searchParams
  if (params.get("error") === "access_denied") return back("denied")

  const tokens = await finishAuthorization(
    provider,
    credentials,
    session.user.id,
    origin,
    params,
    cookie,
  )
  if (!tokens) return back("failed")
  const account = await provider.account(tokens.accessToken)
  if (!account) return back("failed")

  await saveConnection(session.user.id, provider.id, account, tokens)
  return back()
}
