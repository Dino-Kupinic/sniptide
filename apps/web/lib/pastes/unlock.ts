export function unlockCookieName(slug: string) {
  return `sniptide_unlock_${slug}`
}

export async function unlockToken(slug: string, password: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${slug}:${password}`),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
