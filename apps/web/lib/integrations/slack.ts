import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"
import type { ExportDestination, ExportPaste, Failure, IntegrationProvider } from "./types"

// Slack: sending a paste to a channel. The connection installs Sniptide's app in one workspace
// and keeps its bot token, which can post to any public channel and to private channels the app
// was invited to.

const API = "https://slack.com/api"
const PAGE_SIZE = 200
// Five pages is a thousand channels, enough to pick from without stalling the Share dialog.
const MAX_PAGES = 5

const UNAVAILABLE: Failure = { ok: false, error: "Slack didn't answer. Try again in a minute." }
const NOT_IN_CHANNEL: Failure = {
  ok: false,
  error: "Sniptide can't post in that channel. Invite the Sniptide app to it, then try again.",
}
const DISCONNECTED: Failure = {
  ok: false,
  error: "That connection stopped working. Connect it again in Settings.",
  unauthorized: true,
}

// Errors that mean the token itself is no good, so the framework drops the connection.
const TOKEN_ERRORS = new Set([
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
  "account_inactive",
])
const CHANNEL_ERRORS = new Set(["not_in_channel", "channel_not_found", "is_archived"])

const answerSchema = z.object({ ok: z.boolean(), error: z.string().optional() })

const channelsSchema = z.object({
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      is_private: z.boolean().optional(),
      is_archived: z.boolean().optional(),
    }),
  ),
  response_metadata: z.object({ next_cursor: z.string().optional() }).optional(),
})

const accountSchema = z.object({ team_id: z.string(), team: z.string() })

// Slack answers 200 with `ok: false` for most errors, so the body decides.
async function call(
  method: string,
  token: string,
  body: Record<string, string>,
): Promise<{ ok: true; data: unknown } | Failure> {
  // Form encoding, because Slack's read methods such as conversations.list ignore JSON bodies.
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch(() => null)
  if (!response) return UNAVAILABLE
  if (response.status === 401) return DISCONNECTED
  if (!response.ok) return UNAVAILABLE
  const data: unknown = await response.json().catch(() => null)
  const answer = answerSchema.safeParse(data)
  if (!answer.success) return UNAVAILABLE
  if (answer.data.ok) return { ok: true, data }
  const error = answer.data.error ?? ""
  if (TOKEN_ERRORS.has(error)) return DISCONNECTED
  if (CHANNEL_ERRORS.has(error)) return NOT_IN_CHANNEL
  return UNAVAILABLE
}

// Slack reads &, < and > as markup, so a paste title can't turn into a mention or a link.
function escapeText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function slackMessage(paste: ExportPaste) {
  if (paste.title === null) return { text: `<${paste.url}>`, unfurl_links: "false" }
  const language = paste.language ? ` · ${escapeText(paste.language)}` : ""
  return { text: `<${paste.url}|${escapeText(paste.title)}>${language}`, unfurl_links: "true" }
}

async function destinations(
  token: string,
): Promise<{ ok: true; destinations: ExportDestination[] } | Failure> {
  const found: ExportDestination[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await call("conversations.list", token, {
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: String(PAGE_SIZE),
      ...(cursor ? { cursor } : {}),
    })
    if (!result.ok) return result
    const parsed = channelsSchema.safeParse(result.data)
    if (!parsed.success) return UNAVAILABLE
    for (const channel of parsed.data.channels) {
      if (channel.is_archived) continue
      found.push({ id: channel.id, name: channel.name, private: channel.is_private ?? false })
    }
    cursor = parsed.data.response_metadata?.next_cursor || undefined
    if (!cursor) break
  }
  found.sort((a, b) => a.name.localeCompare(b.name))
  return { ok: true, destinations: found }
}

export const slack: IntegrationProvider = {
  id: "slack",
  name: "Slack",
  oauth: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: `${API}/oauth.v2.access`,
    // chat:write.public posts to public channels the app hasn't joined. groups:read lists the
    // private channels it was invited to.
    scopes: ["chat:write", "chat:write.public", "channels:read", "groups:read"],
    scopeSeparator: ",",
    // Slack only takes PKCE from apps switched to public clients, which can't keep a secret.
    pkce: false,
    credentials: () => getConfig().slack ?? null,
  },
  async account(token) {
    const result = await call("auth.test", token, {})
    if (!result.ok) return null
    const account = accountSchema.safeParse(result.data)
    return account.success ? { id: account.data.team_id, name: account.data.team } : null
  },
  async revoke(token) {
    await call("auth.revoke", token, {})
  },
  exports: {
    destinations,
    async send(token, destination, paste) {
      const result = await call("chat.postMessage", token, {
        channel: destination,
        ...slackMessage(paste),
      })
      return result.ok ? { ok: true } : result
    },
  },
}
