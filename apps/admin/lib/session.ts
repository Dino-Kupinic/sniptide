import { createHash, createHmac, timingSafeEqual } from "node:crypto"

// One operator password, set in ADMIN_PASSWORD. Signing in sets a cookie that carries its expiry
// and an HMAC of it keyed by the password, so changing the password signs everyone out.

export const SESSION_COOKIE = "sniptide_admin"
export const SESSION_DAYS = 30

function sign(expires: number, password: string) {
  return createHmac("sha256", password).update(`sniptide-admin:${expires}`).digest("base64url")
}

function same(a: string, b: string) {
  // Hashing first gives both sides one length, so the comparison leaks nothing about either.
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(a), digest(b))
}

export function passwordMatches(input: string, password: string) {
  return same(input, password)
}

export function createSession(password: string, now = Date.now()) {
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000
  return `${expires}.${sign(expires, password)}`
}

export function validSession(value: string | undefined, password: string, now = Date.now()) {
  if (!value) return false
  const [rawExpires, signature] = value.split(".")
  const expires = Number(rawExpires)
  if (!signature || !Number.isSafeInteger(expires) || expires <= now) return false
  return same(signature, sign(expires, password))
}
