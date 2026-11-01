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

// ALLOW_SIGN_UP=false: nobody can create an account, listed or not. Covers email and OAuth.
// The codes reach the sign-in page as ?error=<code> when a GitHub or Google sign-up is refused.
export function assertSignUpOpen(allowSignUp: boolean) {
  if (!allowSignUp)
    throw new APIError("FORBIDDEN", { message: SIGN_UP_CLOSED_MESSAGE, code: "sign_up_closed" })
}

export function assertAllowed(allowlist: Set<string> | undefined, email: unknown) {
  if (!allowlist) return
  if (typeof email === "string" && allowlist.has(email.trim().toLowerCase())) return
  throw new APIError("FORBIDDEN", { message: INVITE_ONLY_MESSAGE, code: "invite_only" })
}
