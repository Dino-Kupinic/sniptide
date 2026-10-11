import { APIError } from "better-auth/api"

// Invite-only sign-up while sniptide is in early access: only these emails can create an
// account. Temporary, so it lives in an env var rather than a table. Accounts that already exist
// keep signing in either way.

export const INVITE_ONLY_MESSAGE = "Sniptide is invite-only for now. Apply for access to get in."

// A comma-separated list of emails. Unset or empty means anyone can sign up (the default for
// self-hosting).
export function parseAllowlist(value?: string): Set<string> | undefined {
  const emails = (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return emails.length ? new Set(emails) : undefined
}

export function assertAllowed(allowlist: Set<string> | undefined, email: unknown) {
  if (!allowlist) return
  if (typeof email === "string" && allowlist.has(email.trim().toLowerCase())) return
  throw new APIError("FORBIDDEN", { message: INVITE_ONLY_MESSAGE })
}
