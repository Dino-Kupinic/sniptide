// Usernames end up in URLs (sniptide.com/@dino), so keep them to lowercase letters, digits,
// hyphens and underscores. Kept free of server imports so client forms can share it.
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/
