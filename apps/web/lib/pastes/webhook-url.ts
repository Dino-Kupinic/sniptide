export const WEBHOOK_TARGETS = ["slack", "discord"] as const
export type WebhookTarget = (typeof WEBHOOK_TARGETS)[number]

// Only provider-owned incoming webhook endpoints, with no credentials, query or alternate port.
// These are server settings, never destinations supplied by a share action.
export function isWebhookUrl(value: string, target: WebhookTarget) {
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return false
    if (target === "slack")
      return (
        url.hostname === "hooks.slack.com" &&
        /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)
      )
    return (
      url.hostname === "discord.com" && /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)
    )
  } catch {
    return false
  }
}
