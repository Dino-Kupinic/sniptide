import "server-only"

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

// Paste passwords are stored as "salt:hash" (hex, scrypt), never in plain text.
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const hash = await scrypt(password, salt, 32)
  return `${salt}:${hash.toString("hex")}`
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, "hex")
  const actual = await scrypt(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}
