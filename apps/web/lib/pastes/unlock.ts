export function unlockCookieName(slug: string) {
  return `sniptide_unlock_${slug}`
}

// `passwordHash` is the paste's stored hash, so the token changes with the password.
export async function unlockToken(slug: string, passwordHash: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${slug}:${passwordHash}`),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
