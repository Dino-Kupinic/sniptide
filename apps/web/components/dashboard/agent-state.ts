// Whether the dashboard's connect-an-agent card is hidden, kept in a cookie so the server renders
// the small link instead of the card and nothing jumps on load. Shared by the page and the card.

export const AGENT_CARD_COOKIE = "dashboard-agent-card"

export function isAgentCardHidden(value: string | undefined) {
  return value === "hidden"
}

export function writeAgentCardHidden(hidden: boolean) {
  // biome-ignore lint/suspicious/noDocumentCookie: one small preference cookie; no store needed.
  document.cookie = hidden
    ? `${AGENT_CARD_COOKIE}=hidden; path=/; max-age=31536000; samesite=lax`
    : `${AGENT_CARD_COOKIE}=; path=/; max-age=0; samesite=lax`
}
