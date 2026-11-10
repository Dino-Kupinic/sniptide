// Who the next request is from, and the cookies it carries. Kept free of imports so the preload
// can read it before the Next-only modules are mocked.
export const request = {
  viewer: null as string | null,
  // The viewer's username, as better-auth puts it on the session.
  username: null as string | null,
  cookies: new Map<string, string>(),
  headers: new Headers(),
}
