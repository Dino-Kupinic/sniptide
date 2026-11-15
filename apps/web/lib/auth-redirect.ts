// Where sign-in and sign-up send the visitor afterwards. ?next= may name only the OAuth consent
// screen or the new-paste editor opened from a template, so the parameter can't turn the sign-in
// page into an open redirect.
export function afterSignIn(next: string | string[] | undefined) {
  return typeof next === "string" && isReturnTarget(next) ? next : "/dashboard"
}

function isReturnTarget(path: string) {
  return (
    /^\/oauth\/authorize(?:\?[^#\\]*)?$/.test(path) ||
    /^\/new(?:\?template=[a-z0-9-]{1,64})?$/.test(path)
  )
}

// The request header proxy.ts sets to the path and query of the page being opened, so a page behind
// sign-in can send the visitor back to it afterwards (requireSession in lib/auth.ts). The proxy
// replaces any value a client sends.
export const RETURN_TO_HEADER = "x-sniptide-return-to"

// The sign-in address for a visitor who opened `path` without a session. Only the paths ?next=
// accepts are carried along; every other page signs in to the dashboard, as before.
export function signInPath(path: string | null) {
  return path && isReturnTarget(path) ? `/sign-in?next=${encodeURIComponent(path)}` : "/sign-in"
}
