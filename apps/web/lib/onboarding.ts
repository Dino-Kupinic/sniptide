// The welcome wizard's answers. Each list is fixed, so stored values stay comparable across
// accounts and a crafted request can't write anything else.

export const SIGNUP_SOURCES = [
  "hacker_news",
  "reddit",
  "x",
  "friend",
  "ai_agent",
  "search",
  "other",
] as const

export const USE_CASES = ["agents", "sharing", "team", "exploring"] as const

// The clients the last step has setup instructions for, most used first.
export const AGENT_CLIENTS = ["claude_code", "codex", "cursor", "other"] as const

export const ONBOARDING_STEPS = ["source", "use_case", "agent"] as const

export type SignupSource = (typeof SIGNUP_SOURCES)[number]
export type SignupSourceAnswer = SignupSource | "skipped"
export type UseCase = (typeof USE_CASES)[number]
export type AgentClient = (typeof AGENT_CLIENTS)[number]
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export function isSignupSourceAnswer(value: unknown): value is SignupSourceAnswer {
  return value === "skipped" || SIGNUP_SOURCES.some((source) => source === value)
}

export function isUseCase(value: unknown): value is UseCase {
  return USE_CASES.some((useCase) => useCase === value)
}

// Only recent accounts see the wizard, so a long-standing user is never asked about a sign-up
// they made months ago.
export const ONBOARDING_WINDOW_DAYS = 14

// The MCP server's address and the one-line setups for each client. Each one signs in through the
// OAuth consent screen the first time it connects, so no token is pasted anywhere. Cursor installs
// from a deep link whose config is base64 JSON.
export function agentSetup(origin: string) {
  const url = `${origin}/api/mcp`
  const config = btoa(JSON.stringify({ url }))
  return {
    url,
    claudeCode: `claude mcp add --transport http sniptide ${url}`,
    codex: `codex mcp add sniptide --url ${url}`,
    cursorLink: `cursor://anysphere.cursor-deeplink/mcp/install?name=sniptide&config=${encodeURIComponent(config)}`,
  }
}

// Which client an OAuth connection came from, judged by the name it registered with. The name is
// chosen by the client, so it only picks one of the fixed values and is never shown or sent as is.
// A stored client value, or null for anything that isn't one.
export function agentClientOf(value: string | null | undefined): AgentClient | null {
  return AGENT_CLIENTS.find((client) => client === value) ?? null
}

export function agentClientFromName(name: string): AgentClient {
  const value = name.toLowerCase()
  if (value.includes("claude")) return "claude_code"
  if (value.includes("codex") || value.includes("openai")) return "codex"
  if (value.includes("cursor")) return "cursor"
  return "other"
}
