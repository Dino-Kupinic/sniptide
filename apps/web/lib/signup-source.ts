// The answers to "How did you hear about Sniptide?". The list is fixed, so the stored values stay
// comparable and a crafted request can't write anything else.
export const SIGNUP_SOURCES = [
  "hacker_news",
  "reddit",
  "x",
  "friend",
  "ai_agent",
  "search",
  "other",
] as const

export type SignupSource = (typeof SIGNUP_SOURCES)[number]
export type SignupSourceAnswer = SignupSource | "skipped"

export function isSignupSourceAnswer(value: unknown): value is SignupSourceAnswer {
  return value === "skipped" || SIGNUP_SOURCES.some((source) => source === value)
}

// Only recent accounts are asked, so a long-standing user never gets a question about a sign-up
// they made months ago.
export const SIGNUP_SOURCE_WINDOW_DAYS = 14
