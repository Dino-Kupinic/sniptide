import "server-only"

import type { Visibility } from "./types"
import { isWebhookUrl, type WebhookTarget } from "./webhook-url"

export type WebhookShareResult = { ok: true } | { ok: false; error: string }

export async function sendWebhook(
  target: WebhookTarget,
  endpoint: string,
  paste: { slug: string; title: string; visibility: Visibility },
  origin: string,
): Promise<WebhookShareResult> {
  if (!isWebhookUrl(endpoint, target))
    return { ok: false, error: "That webhook isn't configured correctly." }
  const url = `${origin}/${encodeURIComponent(paste.slug)}`
  // Escape Slack's special tokens so a paste title cannot turn into a mention or link.
  const slackTitle = paste.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const body =
    target === "slack"
      ? { text: `${slackTitle}\n${url}`, unfurl_links: true, unfurl_media: true }
      : {
          content: url,
          allowed_mentions: { parse: [] },
          embeds: [
            {
              title: paste.title,
              url,
              ...(paste.visibility === "public" ? { image: { url: `${url}/preview` } } : {}),
              footer: { text: "Shared with Sniptide" },
            },
          ],
        }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch(() => null)
  // Never return provider bodies: they may contain the secret URL. Don't retry an ambiguous
  // timeout automatically, since a channel may already have received the message.
  if (!response?.ok)
    return {
      ok: false,
      error: "The webhook didn't confirm delivery. Check the channel before trying again.",
    }
  return { ok: true }
}
