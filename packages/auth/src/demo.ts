// On a demo instance every visitor shares one guest account, so these calls (changing its sign-in
// details, linking other logins to it or deleting it) are refused for everyone. Listing and
// revoking sessions is refused too: the sessions belong to other visitors.
export const DEMO_LOCKED_MESSAGE = "This isn't available in the demo."

export const DEMO_LOCKED_PATHS = new Set([
  "/change-email",
  "/change-password",
  "/set-password",
  "/delete-user",
  "/link-social",
  "/unlink-account",
  "/reset-password",
  "/request-password-reset",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
])
