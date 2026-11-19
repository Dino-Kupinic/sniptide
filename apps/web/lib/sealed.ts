import "server-only"

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"
import { getConfig } from "@/lib/config"

// Values Sniptide keeps but must not be readable from a database dump are encrypted with
// AES-256-GCM. The key comes from ENV_SECRETS_KEY, or from BETTER_AUTH_SECRET when that isn't
// set, through HKDF, so it is never the auth secret itself. Each kind of value (`purpose`) gets
// its own key. Changing whichever secret is in use makes stored values unreadable.

const VERSION = "v1"
const keys = new Map<string, { secret: string; key: Buffer }>()

function key(purpose: string) {
  const { envSecretsKey, authSecret } = getConfig()
  const secret = envSecretsKey ?? authSecret
  if (!secret) throw new Error("Set ENV_SECRETS_KEY or BETTER_AUTH_SECRET to store secrets.")
  let cached = keys.get(purpose)
  if (cached?.secret !== secret) {
    cached = { secret, key: Buffer.from(hkdfSync("sha256", secret, "sniptide", purpose, 32)) }
    keys.set(purpose, cached)
  }
  return cached.key
}

// `context` names where the value lives, such as its row and column. It is bound as associated
// data, so a value copied somewhere else fails to decrypt instead of quietly moving.
export function seal(value: string, context: string, purpose: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv)
  cipher.setAAD(Buffer.from(context))
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":")
}

export function unseal(stored: string, context: string, purpose: string) {
  const [version, iv, tag, data] = stored.split(":")
  if (version !== VERSION || iv === undefined || tag === undefined || data === undefined)
    throw new Error("Unknown sealed value format.")
  const decipher = createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
