// Better Auth sends GitHub and Google failures back as ?error=<code>. These are the ones a person
// can act on; anything else gets the generic message. Keys live under Auth.oauthErrors.
const KNOWN = {
  account_not_linked: "accountNotLinked",
  invite_only: "inviteOnly",
  sign_up_closed: "signUpClosed",
  signup_disabled: "signUpClosed",
  email_not_found: "emailNotFound",
  account_already_linked_to_different_user: "alreadyLinked",
  access_denied: "cancelled",
} as const

export type OAuthErrorKey = (typeof KNOWN)[keyof typeof KNOWN] | "generic"

export function oauthErrorKey(code: unknown): OAuthErrorKey | null {
  if (typeof code !== "string" || !code) return null
  return Object.hasOwn(KNOWN, code) ? KNOWN[code as keyof typeof KNOWN] : "generic"
}
