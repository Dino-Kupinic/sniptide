// End-to-end encryption for pastes. Everything here runs where the plaintext lives (a browser,
// later the CLI) and uses only Web Crypto, so no cryptography code ships as a dependency. The
// server stores the envelope and the key id and never sees the key.
//
// A paste has one random 256-bit secret, carried in the share link's fragment. Each envelope
// derives its own AES-256-GCM key from that secret and a fresh salt with HKDF-SHA-256, so the
// secret itself never encrypts anything and a nonce can't repeat under one key.
//
// Envelope: "sniptide.e2e.v1." + base64url(salt[16] | nonce[12] | ciphertext and tag). The scheme
// name is authenticated as additional data. The plaintext is a 4-byte big-endian length, the JSON
// payload, then zero padding up to a Padmé bucket (at least MIN_PADDED_BYTES), so the stored size
// says little about the real one.

export const ENCRYPTION_SCHEME = "sniptide.e2e.v1"

// The single file an encrypted paste stores; its content is the envelope.
export const ENCRYPTED_FILE_NAME = "encrypted"

const SALT_BYTES = 16
const NONCE_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const KEY_ID_BYTES = 12
const LENGTH_PREFIX_BYTES = 4
export const MIN_PADDED_BYTES = 512

const base64url = (bytes: number) => Math.ceil((bytes * 4) / 3)
const MIN_ENVELOPE_BODY = base64url(SALT_BYTES + NONCE_BYTES + MIN_PADDED_BYTES + TAG_BYTES)

export const ENVELOPE_PATTERN = new RegExp(
  `^${ENCRYPTION_SCHEME.replaceAll(".", "\\.")}\\.[A-Za-z0-9_-]{${MIN_ENVELOPE_BODY},}$`,
)
export const KEY_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${base64url(KEY_BYTES)}}$`)
export const KEY_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${base64url(KEY_ID_BYTES)}}$`)

// What an envelope holds. The title stays outside it, readable to the server.
export interface EncryptedPayload {
  description: string
  files: { name: string; content: string }[]
}

// The key is missing, malformed or not this envelope's, or the envelope was changed. The cases
// are deliberately not told apart: AES-GCM gives one answer for all of them.
export class DecryptionError extends Error {
  constructor() {
    super("This paste can't be decrypted with that key.")
    this.name = "DecryptionError"
  }
}

const encoder = new TextEncoder()
const schemeBytes = encoder.encode(ENCRYPTION_SCHEME)

export function toBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function fromBase64Url(text: string) {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

// Padmé (Nikitin et al., PETS 2019): rounds a length up so only its most significant bits
// survive. The overhead stays under 12% and the padded size leaks O(log log n) bits.
export function paddedLength(length: number) {
  if (length <= MIN_PADDED_BYTES) return MIN_PADDED_BYTES
  const exponent = 31 - Math.clz32(length)
  const kept = 32 - Math.clz32(exponent)
  const mask = 2 ** (exponent - kept) - 1
  return length + mask - ((length + mask) % (mask + 1))
}

export function generateKey() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)))
}

async function importSecret(key: string) {
  if (!KEY_PATTERN.test(key)) throw new DecryptionError()
  return crypto.subtle.importKey("raw", fromBase64Url(key), "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ])
}

// A public fingerprint of the key. A browser uses it to find the key it holds for a paste, and
// to tell a wrong key from a damaged envelope. HKDF output says nothing about the secret.
export async function keyIdOf(key: string) {
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encoder.encode(`${ENCRYPTION_SCHEME} key-id`),
    },
    await importSecret(key),
    KEY_ID_BYTES * 8,
  )
  return toBase64Url(new Uint8Array(bits))
}

async function contentKey(key: string, salt: Uint8Array, usage: "encrypt" | "decrypt") {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: encoder.encode(`${ENCRYPTION_SCHEME} content`),
    },
    await importSecret(key),
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  )
}

export async function encryptPayload(payload: EncryptedPayload, key: string) {
  const json = encoder.encode(
    JSON.stringify({
      description: payload.description,
      files: payload.files.map(({ name, content }) => ({ name, content })),
    }),
  )
  const plaintext = new Uint8Array(paddedLength(LENGTH_PREFIX_BYTES + json.length))
  new DataView(plaintext.buffer).setUint32(0, json.length)
  plaintext.set(json, LENGTH_PREFIX_BYTES)

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: schemeBytes },
      await contentKey(key, salt, "encrypt"),
      plaintext,
    ),
  )
  const body = new Uint8Array(SALT_BYTES + NONCE_BYTES + ciphertext.length)
  body.set(salt)
  body.set(nonce, SALT_BYTES)
  body.set(ciphertext, SALT_BYTES + NONCE_BYTES)
  return `${ENCRYPTION_SCHEME}.${toBase64Url(body)}`
}

function parsePayload(value: unknown): EncryptedPayload {
  if (typeof value !== "object" || value === null) throw new DecryptionError()
  const { description, files } = value as Record<string, unknown>
  if (typeof description !== "string" || !Array.isArray(files) || files.length === 0)
    throw new DecryptionError()
  return {
    description,
    files: files.map((file: unknown) => {
      if (typeof file !== "object" || file === null) throw new DecryptionError()
      const { name, content } = file as Record<string, unknown>
      if (typeof name !== "string" || typeof content !== "string") throw new DecryptionError()
      return { name, content }
    }),
  }
}

export async function decryptPayload(envelope: string, key: string): Promise<EncryptedPayload> {
  if (!ENVELOPE_PATTERN.test(envelope)) throw new DecryptionError()
  try {
    const body = fromBase64Url(envelope.slice(ENCRYPTION_SCHEME.length + 1))
    const salt = body.subarray(0, SALT_BYTES)
    const nonce = body.subarray(SALT_BYTES, SALT_BYTES + NONCE_BYTES)
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce as BufferSource, additionalData: schemeBytes },
        await contentKey(key, salt, "decrypt"),
        body.subarray(SALT_BYTES + NONCE_BYTES) as BufferSource,
      ),
    )
    const length = new DataView(plaintext.buffer).getUint32(0)
    if (length > plaintext.length - LENGTH_PREFIX_BYTES) throw new DecryptionError()
    const json = plaintext.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length)
    return parsePayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json)))
  } catch {
    throw new DecryptionError()
  }
}

// The key travels as "#key=<key>": browsers never send a fragment to the server.
const FRAGMENT_NAME = "key"

export function withKeyFragment(url: string, key: string) {
  return `${url.split("#")[0]}#${FRAGMENT_NAME}=${key}`
}

// The key in a fragment ("#key=…"), in a whole link, or given bare. Null when there is none.
export function readKey(input: string): string | null {
  const text = input.trim()
  if (KEY_PATTERN.test(text)) return text
  const fragment = text.includes("#") ? text.slice(text.indexOf("#") + 1) : ""
  const key = new URLSearchParams(fragment).get(FRAGMENT_NAME)
  return key && KEY_PATTERN.test(key) ? key : null
}
