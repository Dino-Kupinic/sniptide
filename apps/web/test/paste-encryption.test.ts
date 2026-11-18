import { describe, expect, test } from "bun:test"
import {
  DecryptionError,
  decryptPayload,
  ENCRYPTION_SCHEME,
  ENVELOPE_PATTERN,
  encryptPayload,
  fromBase64Url,
  generateKey,
  KEY_ID_PATTERN,
  KEY_PATTERN,
  keyIdOf,
  MIN_PADDED_BYTES,
  paddedLength,
  readKey,
  toBase64Url,
  withKeyFragment,
} from "@sniptide/contracts/encryption"

const payload = {
  description: "Deploy credentials",
  files: [
    { name: ".env", content: "API_KEY=sk-live-ünïcode-🔑\n" },
    { name: "notes.md", content: "" },
  ],
}

// Flips one bit of the envelope's decoded bytes at `index` (negative counts from the end).
function tamper(envelope: string, index: number) {
  const bytes = fromBase64Url(envelope.slice(ENCRYPTION_SCHEME.length + 1))
  const at = index < 0 ? bytes.length + index : index
  bytes[at] = (bytes[at] ?? 0) ^ 1
  return `${ENCRYPTION_SCHEME}.${toBase64Url(bytes)}`
}

describe("envelope", () => {
  test("round-trips the description and every file", async () => {
    const key = generateKey()
    const envelope = await encryptPayload(payload, key)
    expect(envelope).toMatch(ENVELOPE_PATTERN)
    expect(await decryptPayload(envelope, key)).toEqual(payload)
  })

  test("holds no plaintext, file name or key", async () => {
    const key = generateKey()
    const envelope = await encryptPayload(payload, key)
    const decoded = new TextDecoder("latin1").decode(
      fromBase64Url(envelope.slice(ENCRYPTION_SCHEME.length + 1)),
    )
    for (const secret of ["API_KEY", "sk-live", ".env", "notes.md", "Deploy", key]) {
      expect(envelope).not.toContain(secret)
      expect(decoded).not.toContain(secret)
    }
  })

  test("encrypting the same payload twice gives unrelated envelopes", async () => {
    const key = generateKey()
    const [first, second] = await Promise.all([
      encryptPayload(payload, key),
      encryptPayload(payload, key),
    ])
    expect(first).not.toBe(second)
    // Different salts and nonces, so not even a shared prefix.
    expect(first.slice(0, 40)).not.toBe(second.slice(0, 40))
  })

  test("a different key fails", async () => {
    const envelope = await encryptPayload(payload, generateKey())
    await expect(decryptPayload(envelope, generateKey())).rejects.toBeInstanceOf(DecryptionError)
  })

  test("a changed salt, nonce, ciphertext or tag fails", async () => {
    const key = generateKey()
    const envelope = await encryptPayload(payload, key)
    for (const index of [0, 16, 28, 100, -17, -1]) {
      await expect(decryptPayload(tamper(envelope, index), key)).rejects.toBeInstanceOf(
        DecryptionError,
      )
    }
  })

  test("a truncated or extended envelope fails", async () => {
    const key = generateKey()
    const envelope = await encryptPayload(payload, key)
    await expect(decryptPayload(envelope.slice(0, -4), key)).rejects.toBeInstanceOf(DecryptionError)
    await expect(decryptPayload(`${envelope}AAAA`, key)).rejects.toBeInstanceOf(DecryptionError)
  })

  test("another scheme name fails, since the name is authenticated", async () => {
    const key = generateKey()
    const envelope = await encryptPayload(payload, key)
    await expect(
      decryptPayload(envelope.replace(ENCRYPTION_SCHEME, "sniptide.e2e.v2"), key),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  test("malformed keys and envelopes fail the same way", async () => {
    const key = generateKey()
    const envelope = await encryptPayload(payload, key)
    for (const bad of ["", "short", `${key}A`, key.replace(/.$/, "!")]) {
      await expect(decryptPayload(envelope, bad)).rejects.toBeInstanceOf(DecryptionError)
    }
    for (const bad of ["", "plain text", `${ENCRYPTION_SCHEME}.`, `${ENCRYPTION_SCHEME}.AAAA`]) {
      await expect(decryptPayload(bad, key)).rejects.toBeInstanceOf(DecryptionError)
    }
  })

  // Pins the format: an envelope written by this version must stay readable by later ones.
  test("decrypts a fixed envelope", async () => {
    const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    const envelope =
      "sniptide.e2e.v1.HKJbnqZHpYNtRzF7x8-zBJSXc2zSSm5RJHe9XYfbVrYCVRNxYFaCAgat2w0wKsNpzMK_ay9AuDJ3r9g7IvPRrZlDc8VoNb7ePCEyESuerMk7Vc2bxEQzHmgmQJAhz4VtWzMWT-KBAiXJcTOSUlb60cUbIK0RX3_V595DqrWTxEGH9F_pcO02O0ZgvXHziyygxwx56EBeENpnohPWEsN2DOxnPeNtzMNXsLVBNZN2V4wqE3QoBT5xd6Ex6Dz5E6-dXNd55XoTk1YiJcMdbBifsz5etSyN1h98GIzXYvt1mJabxm0Iht6yjs7z04vFI-ui6iw4hBndt82QbxogT5N27WnlUm6vNVPDqygMoIYSpEOhh4hM0vttOkzMybYIyVmIMuIYd6bIfsQJlzP9fKa65TgPx1zRarsPBdaV_voUYubGo3nAlhmgTTF6UgL8s4bCj5fyMPa83nD4I_wZ5abzjqtrgnHR69Q_eSIYKi_svcih33ZLr_x7ceVrCXHExGgBpbtxcnoUuX2wwGpDXzqjygE-ETzZCuklvYvKGLoS-ulnM-UUw4b0rGRjVDZpi77wNiUPytlX7VGhdQz5QHQd6AsRguVN2WLGE3st_iof7DvEUhFNv7YqMKvgpa25p9ICFQ2Zrtog-lE4fE3YkFJAOdVcUuR-vP7rPaxL0teuyvApM1dyYe1MwEIvjXqNg8-Ry6rBIQQByVjlzldvA0--w8tCWtHCdVWoJboEoQ"
    expect(await keyIdOf(key)).toBe("PkImfqDZFr0kFDhq")
    expect(await decryptPayload(envelope, key)).toEqual({
      description: "A fixed vector",
      files: [{ name: "note.txt", content: "tide\n" }],
    })
  })
})

describe("padding", () => {
  test("short payloads share one size, so a short secret's length stays hidden", async () => {
    const key = generateKey()
    const sizes = await Promise.all(
      [1, 20, 64, 300].map(async (length) => {
        const envelope = await encryptPayload(
          { description: "", files: [{ name: "a", content: "x".repeat(length) }] },
          key,
        )
        return envelope.length
      }),
    )
    expect(new Set(sizes).size).toBe(1)
  })

  test("pads to Padmé buckets with under 12% overhead", () => {
    expect(paddedLength(1)).toBe(MIN_PADDED_BYTES)
    expect(paddedLength(MIN_PADDED_BYTES)).toBe(MIN_PADDED_BYTES)
    expect(paddedLength(513)).toBe(544)
    expect(paddedLength(1024)).toBe(1024)
    expect(paddedLength(100_000)).toBe(100_352)
    for (const length of [513, 777, 4097, 65_537, 999_999, 5_000_001]) {
      const padded = paddedLength(length)
      expect(padded).toBeGreaterThanOrEqual(length)
      expect(padded).toBeLessThan(length * 1.12)
      // A bucket is a fixed point: padding again changes nothing.
      expect(paddedLength(padded)).toBe(padded)
    }
  })

  test("round-trips a payload near the default size limit", async () => {
    const key = generateKey()
    const large = { description: "", files: [{ name: "big.log", content: "é".repeat(350_000) }] }
    expect(await decryptPayload(await encryptPayload(large, key), key)).toEqual(large)
  })
})

describe("keys", () => {
  test("a key is 256 random bits and keys differ", () => {
    const keys = new Set(Array.from({ length: 50 }, generateKey))
    expect(keys.size).toBe(50)
    for (const key of keys) {
      expect(key).toMatch(KEY_PATTERN)
      expect(fromBase64Url(key).length).toBe(32)
    }
  })

  test("the key id is stable per key, differs across keys and isn't part of the key", async () => {
    const key = generateKey()
    const id = await keyIdOf(key)
    expect(id).toMatch(KEY_ID_PATTERN)
    expect(await keyIdOf(key)).toBe(id)
    expect(await keyIdOf(generateKey())).not.toBe(id)
    expect(key).not.toContain(id)
  })

  test("reads the key from a fragment, a whole link or a bare key", () => {
    const key = generateKey()
    const link = withKeyFragment("https://sniptide.com/abc123", key)
    expect(link).toBe(`https://sniptide.com/abc123#key=${key}`)
    expect(readKey(link)).toBe(key)
    expect(readKey(`#key=${key}`)).toBe(key)
    expect(readKey(`  ${key}\n`)).toBe(key)
    expect(readKey("https://sniptide.com/abc123")).toBeNull()
    expect(readKey("#key=too-short")).toBeNull()
    expect(readKey("")).toBeNull()
  })

  test("adding a key replaces a fragment already on the link", () => {
    const key = generateKey()
    expect(withKeyFragment("https://sniptide.com/abc#key=old", key)).toBe(
      `https://sniptide.com/abc#key=${key}`,
    )
  })
})
