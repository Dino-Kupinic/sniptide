// Who the next request is from, and the cookies it carries. Kept free of imports so the preload
// can read it before the Next-only modules are mocked.
export const request = {
  viewer: null as string | null,
  cookies: new Map<string, string>(),
}
