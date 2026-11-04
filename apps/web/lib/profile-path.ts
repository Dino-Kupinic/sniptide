// Where an account's public profile lives: sniptide.com/@<handle>. Handles are stored lowercase,
// and the link always uses that form so every mention points at the one canonical address.
// Kept free of server imports so client components can link to profiles too.
export function profilePath(handle: string) {
  return `/@${handle.replace(/^@/, "").toLowerCase()}`
}
