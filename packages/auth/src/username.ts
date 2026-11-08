// Usernames end up in URLs (sniptide.com/@dino and its custom links, sniptide.com/@dino/<name>), so
// keep them to lowercase letters, digits, hyphens and underscores. The "@" keeps them apart from
// generated slugs and app routes, so no username needs reserving. Kept free of server imports so
// client forms can share it.
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/

// Whether someone may sign up with, or switch to, `value`.
export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(value)
}
