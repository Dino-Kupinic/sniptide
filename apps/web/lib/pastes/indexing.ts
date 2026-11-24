import { DAY } from "@/lib/time"

// Sniptide Cloud lets search engines index public pastes. A brand-new account could otherwise
// publish spam or malware that ranks on the share domain before anyone reviews it, so its public
// pastes ask not to be indexed until the account is this many days old. The rule reads the
// account's age on every request, so the pastes become indexable on their own once it passes.
const NEW_ACCOUNT_NOINDEX_DAYS = 7

export function isNewAccount(createdAt: Date, now = Date.now()) {
  return now - createdAt.getTime() < NEW_ACCOUNT_NOINDEX_DAYS * DAY
}
