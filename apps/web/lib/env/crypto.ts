import "server-only"

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"
import { getConfig } from "@/lib/config"

// Env values are encrypted with AES-256-GCM before they reach Postgres. The key comes from
// ENV_SECRETS_KEY, or from BETTER_AUTH_SECRET when that isn't set, through HKDF, so it is never
// the auth secret itself. Changing whichever one is in use makes stored values unreadable: push
// the env groups again afterwards.

const VERSION = "v1"
let cached: { secret: string; key: Buffer } | undefined

function key() {
  const { envSecretsKey, authSecret } = getConfig()
  const secret = envSecretsKey ?? authSecret
  if (!secret) throw new Error("Set ENV_SECRETS_KEY or BETTER_AUTH_SECRET to store env groups.")
  if (cached?.secret !== secret)
    cached = {
      secret,
      key: Buffer.from(hkdfSync("sha256", secret, "sniptide", "env-variables:v1", 32)),
    }
  return cached.key
}

// `context` (the group's id and the variable's name) is bound as associated data, so a value
// copied into another row or group fails to decrypt instead of quietly moving.
export function encryptValue(value: string, context: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  cipher.setAAD(Buffer.from(context))
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":")
}

export function decryptValue(stored: string, context: string) {
  const [version, iv, tag, data] = stored.split(":")
  if (version !== VERSION || iv === undefined || tag === undefined || data === undefined)
    throw new Error("Unknown env value format.")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
