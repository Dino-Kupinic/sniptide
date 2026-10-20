"use server"

import { getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
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
  if (!session) return { ok: false, error: await actionError("signInShare") }
  if (!WEBHOOK_TARGETS.includes(target))
    return { ok: false, error: await actionError("webhookTarget") }
  const endpoint = getConfig().webhooks[target]
  if (!endpoint) return { ok: false, error: await actionError("webhookSetup") }
  const paste = await readWebhookPaste(slug)
  if (!paste)
    return {
      ok: false,
      error: await actionError("webhookPaste"),
    }
  const tooOften = await limited(limits.webhook(session.user.id))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }
  const result = await sendWebhook(target, endpoint, paste, (await getSiteOrigin()).origin)
  return result.ok ? result : { ok: false, error: await translateActionError(result.error) }
}
