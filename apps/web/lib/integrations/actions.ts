"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSession, isDemoMode } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import { limited } from "@/lib/pastes/limits"
import type { Limit } from "@/lib/rate-limit"
import { getRequestOrigin, getSiteOrigin } from "@/lib/site"
import { HOUR_SECONDS } from "@/lib/time"
import { listDestinations, sendPaste } from "./exports"
import { listImports } from "./imports"
import { STATE_COOKIE, STATE_SECONDS, startAuthorization } from "./oauth"
import { getProvider } from "./providers"
import { removeConnection } from "./store"
import type { ExportDestination, ImportSummary } from "./types"

type Result = { ok: true } | { ok: false; error: string }

const SETTINGS_PATH = "/settings?tab=integrations"

const connectLimit = (user: string): Limit => ({
  key: `integration:connect:${user}`,
  max: 20,
  windowSeconds: HOUR_SECONDS,
})
// Listing spends the connected account's own quota at the provider, so it is far looser than the
// limit on reading a link.
const listLimit = (user: string): Limit => ({
  key: `integration:list:${user}`,
  max: 240,
  windowSeconds: HOUR_SECONDS,
})

// Each send posts a message in someone's workspace, so it shares the cap of the channel webhooks.
const sendLimit = (user: string): Limit => ({
  key: `integration:send:${user}`,
  max: 20,
  windowSeconds: HOUR_SECONDS,
})

// Sends the browser to the provider to approve the connection. The provider sends it back to the
// callback route (lib/integrations/callback.ts), which stores the connection.
export async function connectIntegration(providerId: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  // The demo's guest account is shared by every visitor, and so would a connection be.
  if (isDemoMode()) return { ok: false, error: await actionError("demoLocked") }
  const provider = getProvider(providerId)
  const credentials = provider?.oauth.credentials()
  if (!provider || !credentials)
    return { ok: false, error: await actionError("integrationUnavailable") }
  const tooOften = await limited(connectLimit(session.user.id))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }

  const origin = getConfig().appUrl ?? (await getRequestOrigin()).origin
  const { url, cookie } = startAuthorization(provider, credentials, session.user.id, origin)
  ;(await cookies()).set(STATE_COOKIE, cookie, {
    httpOnly: true,
    // Lax, so the cookie comes back on the provider's redirect.
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: STATE_SECONDS,
  })
  redirect(url)
}

// Forgets the connection and ends its token at the provider. The connection is gone here even
// when the provider can't be reached.
export async function disconnectIntegration(providerId: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  const provider = getProvider(providerId)
  if (!provider) return { ok: false, error: await actionError("invalid") }

  const token = await removeConnection(session.user.id, provider.id)
  const credentials = provider.oauth.credentials()
  if (token && credentials) await provider.revoke?.(token, credentials).catch(() => {})
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export type ImportableResult =
  | { ok: true; connected: true; items: ImportSummary[]; nextPage: number | null }
  // `available` is false when the server has no OAuth app for the provider.
  | { ok: true; connected: false; available: boolean }
  | { ok: false; error: string }

// The connected account's own items, for picking one to import.
export async function listImportable(providerId: string, page = 1): Promise<ImportableResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  if (!Number.isInteger(page) || page < 1 || page > 100)
    return { ok: false, error: await actionError("invalid") }
  const tooOften = await limited(listLimit(session.user.id))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }

  const result = await listImports(providerId, session.user.id, page)
  if (!result.ok) return { ok: false, error: await translateActionError(result.error) }
  if (result.connected) return result
  return {
    ok: true,
    connected: false,
    available: !isDemoMode() && Boolean(getProvider(providerId)?.oauth.credentials()),
  }
}

export type DestinationsResult =
  | { ok: true; destinations: ExportDestination[] }
  | { ok: false; error: string }

// Where the connected account can send a paste, such as its Slack channels.
export async function listExportDestinations(providerId: string): Promise<DestinationsResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  const tooOften = await limited(listLimit(session.user.id))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }
  const result = await listDestinations(providerId, session.user.id)
  return result.ok ? result : { ok: false, error: await translateActionError(result.error) }
}

// Sends one of the viewer's pastes to a destination from `listExportDestinations`.
export async function sendToDestination(
  providerId: string,
  slug: string,
  destination: string,
): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInShare") }
  if (!destination || destination.length > 200)
    return { ok: false, error: await actionError("exportDestination") }
  const tooOften = await limited(sendLimit(session.user.id))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }
  const origin = (await getSiteOrigin()).origin
  const result = await sendPaste(providerId, session.user.id, slug, destination, origin)
  return result.ok ? result : { ok: false, error: await translateActionError(result.error) }
}
