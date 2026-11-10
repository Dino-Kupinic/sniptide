// Usernames end up in URLs (sniptide.com/@dino and its custom links, sniptide.com/@dino/<name>), so
// keep them to lowercase letters, digits, hyphens and underscores. The "@" keeps them apart from
// generated slugs and app routes, so no username needs reserving. Kept free of server imports so
// client forms can share it.
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/

// Whether someone may sign up with, or switch to, `value`.
export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(value)
}

// Turns a name from a sign-in provider ("Dino Kupinic", a GitHub login like "Dino-Kupinic") into a
// username, or null when nothing usable is left, such as for a name written only in other scripts.
export function toUsername(value: string | null | undefined) {
  if (!value) return null
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 30)
    .replace(/^[-_]+|[-_]+$/g, "")
  return isValidUsername(slug) ? slug : null
}
