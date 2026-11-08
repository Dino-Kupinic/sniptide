// Usernames end up in URLs (sniptide.com/@dino), so keep them to lowercase letters, digits,
// hyphens and underscores. Kept free of server imports so client forms can share it.
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/

// A username is also the namespace for its owner's custom links (sniptide.com/dino/<name>), so
// it can't be a top-level path the app serves itself: its pages, API, internal routes and the
// folders in apps/web/public. apps/web/test/namespaces.test.ts fails when a new top-level route
// is missing here. On the hosted service the marketing site (sniptide-web) answers sniptide.com
// first and only passes unknown paths to the app, so its top-level routes are reserved too.
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "_next",
  "_profile",
  "_site",
  "about",
  "analytics",
  "api",
  "ask",
  "blog",
  "brand",
  "collections",
  "contact",
  "copyright",
  "dashboard",
  "demo",
  "dev",
  "docs",
  "email",
  "forgot-password",
  "home",
  "impressum",
  "landing",
  "languages",
  "logos",
  "new",
  "not-found",
  "oauth",
  "opengraph-image",
  "pastes",
  "privacy",
  "reset-password",
  "secret-share",
  "secrets",
  "settings",
  "shared",
  "sign-in",
  "sign-up",
  "skills",
  "starred",
  "terms",
  "trash",
  "twitter-image",
  "vision",
  "welcome",
])

// Handles kept for Sniptide's own accounts, such as the one that will own the official templates
// (sniptide.com/sniptide/<name>). Nobody can sign up with them, but unlike RESERVED_USERNAMES
// they are ordinary namespaces, so links under them route normally.
export const OFFICIAL_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "sniptide",
  "support",
  "templates",
])

// Whether someone may sign up with, or switch to, `value`.
export function isValidUsername(value: string) {
  return (
    USERNAME_PATTERN.test(value) && !RESERVED_USERNAMES.has(value) && !OFFICIAL_USERNAMES.has(value)
  )
}

// Whether `value` can hold custom links: any well-formed handle that isn't an app route.
export function isNamespace(value: string) {
  return USERNAME_PATTERN.test(value) && !RESERVED_USERNAMES.has(value)
}
