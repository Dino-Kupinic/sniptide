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

// The clients the last step has setup instructions for.
export const AGENT_CLIENTS = ["claude_code", "cursor", "other"] as const

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

// The MCP server's address and the one-line setups for each client. Cursor installs from a deep
// link whose config is base64 JSON.
export function agentSetup(origin: string) {
  const url = `${origin}/api/mcp`
  const config = btoa(JSON.stringify({ url }))
  return {
    url,
    claudeCode: `claude mcp add --transport http sniptide ${url}`,
    cursorLink: `cursor://anysphere.cursor-deeplink/mcp/install?name=sniptide&config=${encodeURIComponent(config)}`,
  }
}
