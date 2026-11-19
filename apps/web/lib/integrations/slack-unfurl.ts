import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { after } from "next/server"
import { z } from "zod"
import { getConfig } from "@/lib/config"
import { getLanguage } from "@/lib/pastes/languages"
import { isLive } from "@/lib/pastes/lifecycle"
import { findRecord } from "@/lib/pastes/records"
import { getSiteOrigin } from "@/lib/site"
import { exportReveal } from "./exports"
import { escapeText, slackCall } from "./slack"
import { accountToken } from "./store"

// Slack link previews. When someone shares a Sniptide link in a workspace that connected
// Sniptide, Slack sends a link_shared event here and Sniptide answers with the paste's title and
// language. Only pastes open to everyone with the link get a preview: the content policy in
// ./exports.ts decides, as it does for sending.

// Slack signs each request with a timestamp, and a request older than five minutes is refused so
// a captured one can't be replayed.
const MAX_AGE_SECONDS = 5 * 60
const MAX_LINKS = 10

export function validSignature(
  secret: string,
  timestamp: string | null,
  body: string,
  signature: string | null,
  now = Date.now(),
) {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`
  const left = Buffer.from(expected)
  const right = Buffer.from(signature)
  return left.length === right.length && timingSafeEqual(left, right)
}

// The paste slug in a share link on this server, such as "k7Qe2x" or "@ada/notes". Null for any
// other link.
export function slugFromLink(link: string, origin: string) {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  let path: string
  try {
    path = decodeURIComponent(url.pathname.slice(1))
  } catch {
    return null
  }
  if (/^@[^/]+\/[^/]+$/.test(path)) return path
  return /^[A-Za-z0-9_-]+$/.test(path) ? path : null
}

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url_verification"), challenge: z.string() }),
  z.object({
    type: z.literal("event_callback"),
    team_id: z.string(),
    event: z.object({
      type: z.string(),
      channel: z.string().optional(),
      message_ts: z.string().optional(),
      unfurl_id: z.string().optional(),
      source: z.string().optional(),
      links: z.array(z.object({ url: z.string() })).optional(),
    }),
  }),
])

type LinkShared = Extract<z.infer<typeof eventSchema>, { type: "event_callback" }>["event"]

// What Slack shows under the link, or null when the paste gets no preview.
async function previewFor(link: string, origin: string) {
  const slug = slugFromLink(link, origin)
  if (!slug) return null
  const record = await findRecord(slug)
  if (!record || !isLive(record) || exportReveal(record) !== "details") return null
  const language = record.firstLanguage ? getLanguage(record.firstLanguage).name : null
  return {
    title: record.title || "Untitled paste",
    title_link: link,
    ...(language ? { text: escapeText(language) } : {}),
    footer: "Sniptide",
  }
}

async function unfurl(teamId: string, event: LinkShared, origin: string) {
  const unfurls: Record<string, unknown> = {}
  for (const { url } of (event.links ?? []).slice(0, MAX_LINKS)) {
    const preview = await previewFor(url, origin)
    if (preview) unfurls[url] = preview
  }
  if (Object.keys(unfurls).length === 0) return
  const token = await accountToken("slack", teamId)
  if (!token) return
  const target: Record<string, string> | null =
    event.unfurl_id && event.source
      ? { unfurl_id: event.unfurl_id, source: event.source }
      : event.channel && event.message_ts
        ? { channel: event.channel, ts: event.message_ts }
        : null
  if (!target) return
  await slackCall("chat.unfurl", token, { ...target, unfurls: JSON.stringify(unfurls) })
}

// Slack expects an answer within three seconds, so the preview is sent after the response.
// `schedule` is Next.js's `after`; tests pass their own to wait for the preview.
export async function handleSlackEvent(
  request: Request,
  schedule: (task: () => Promise<void>) => void = after,
) {
  const secret = getConfig().slackSigningSecret
  if (!secret) return new Response("Not found", { status: 404 })
  const body = await request.text()
  if (
    !validSignature(
      secret,
      request.headers.get("x-slack-request-timestamp"),
      body,
      request.headers.get("x-slack-signature"),
    )
  )
    return new Response("Invalid signature", { status: 401 })

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return new Response("Bad request", { status: 400 })
  }
  const parsed = eventSchema.safeParse(json)
  if (!parsed.success) return new Response(null, { status: 204 })
  if (parsed.data.type === "url_verification")
    return Response.json({ challenge: parsed.data.challenge })

  const { team_id: teamId, event } = parsed.data
  if (event.type === "link_shared") {
    const { origin } = await getSiteOrigin()
    schedule(() => unfurl(teamId, event, origin).catch(() => {}))
  }
  return new Response(null, { status: 204 })
}
