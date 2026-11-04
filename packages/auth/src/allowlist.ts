import { APIError } from "better-auth/api"

// Invite-only sign-up for a self-hosted instance (ALLOWED_EMAILS): only these emails can create
// an account. Accounts that already exist keep signing in either way.

export const INVITE_ONLY_MESSAGE =
  "This email isn't on this server's invite list. Ask the administrator for an invite."

// A comma-separated list of emails. Unset or empty means anyone can sign up (the default for
// self-hosting).
export function parseAllowlist(value?: string): Set<string> | undefined {
  const emails = (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return emails.length ? new Set(emails) : undefined
}

export const SIGN_UP_CLOSED_MESSAGE = "Sign-up is closed on this instance."

// ALLOW_SIGN_UP: true lets anyone create an account, false lets nobody, and "first" lets only the
// first account be created, so a fresh self-hosted server isn't open to strangers once its owner
// has signed up.
export type SignUpMode = boolean | "first"

// True while a new account can't be created: always under false, and once any account exists
// under "first". `hasAccounts` is only called for "first".
export async function isSignUpClosedFor(mode: SignUpMode, hasAccounts: () => Promise<boolean>) {
  if (mode === "first") return hasAccounts()
  return !mode
}

// Refuses a new account while sign-up is closed, listed or not. Covers email and OAuth.
// The codes reach the sign-in page as ?error=<code> when a GitHub or Google sign-up is refused.
export async function assertSignUpOpen(mode: SignUpMode, hasAccounts: () => Promise<boolean>) {
  if (await isSignUpClosedFor(mode, hasAccounts))
    throw new APIError("FORBIDDEN", { message: SIGN_UP_CLOSED_MESSAGE, code: "sign_up_closed" })
}

export function assertAllowed(allowlist: Set<string> | undefined, email: unknown) {
  if (!allowlist) return
  if (typeof email === "string" && allowlist.has(email.trim().toLowerCase())) return
  throw new APIError("FORBIDDEN", { message: INVITE_ONLY_MESSAGE, code: "invite_only" })
}
