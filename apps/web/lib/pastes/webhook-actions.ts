"use server"

import { getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getSiteOrigin } from "@/lib/site"
import { limited, limits } from "./limits"
import { readWebhookPaste } from "./store"
import { WEBHOOK_TARGETS, type WebhookTarget } from "./webhook-url"
import { sendWebhook, type WebhookShareResult } from "./webhooks"

export async function shareToWebhook(
  slug: string,
  target: WebhookTarget,
): Promise<WebhookShareResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Sign in to share a paste." }
  if (!WEBHOOK_TARGETS.includes(target)) return { ok: false, error: "Choose Slack or Discord." }
  const endpoint = getConfig().webhooks[target]
  if (!endpoint)
    return { ok: false, error: "Ask your instance administrator to configure this webhook." }
  const paste = await readWebhookPaste(slug)
  if (!paste)
    return {
      ok: false,
      error:
        "Only the owner can share a live public or unlisted paste without a password or one-time protection.",
    }
  const tooOften = await limited(limits.webhook(session.user.id))
  if (tooOften) return { ok: false, error: tooOften }
  return sendWebhook(target, endpoint, paste, (await getSiteOrigin()).origin)
}
