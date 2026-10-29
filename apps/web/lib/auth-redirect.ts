// Where sign-in and sign-up send the visitor afterwards. Only the OAuth consent screen may be
// named in ?next=, so the parameter can't turn the sign-in page into an open redirect.
export function afterSignIn(next: string | string[] | undefined) {
  return typeof next === "string" && /^\/oauth\/authorize(?:\?[^#\\]*)?$/.test(next)
    ? next
    : "/dashboard"
}
