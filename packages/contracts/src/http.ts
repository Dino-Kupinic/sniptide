// What the CLI and the MCP server share when they call a Sniptide instance: which base URLs they
// accept and how much of a response they read. Free of Zod, so a client bundles only this file.

export const DEFAULT_BASE_URL = "https://app.sniptide.com"

// A token travels with every request, so the instance has to be reached over HTTPS. Plain HTTP is
// accepted on the local machine for development. `Failure` is the caller's own error class.
export function normalizeBaseUrl(
  value: string,
  Failure: new (message: string) => Error = Error,
): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Failure("The base URL must be an absolute URL.")
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    throw new Failure("Use HTTPS, or HTTP on localhost for development.")
  if (url.username || url.password || url.search || url.hash)
    throw new Failure("The base URL cannot contain credentials, a query, or a fragment.")
  return url.href.replace(/\/+$/, "")
}

export const MAX_RESPONSE_BYTES = 25 * 1024 * 1024

export class ResponseTooLargeError extends Error {
  constructor() {
    super("The response exceeds 25 MiB.")
    this.name = "ResponseTooLargeError"
  }
}

// Reads a JSON body and stops at the limit, so an instance can't make the client buffer an
// unbounded response. Throws ResponseTooLargeError past the limit and a plain error for a missing
// body or invalid JSON.
export async function readJson(response: Response, maxBytes = MAX_RESPONSE_BYTES) {
  if (!response.body) throw new Error("Missing response body")
  const reader = response.body.getReader()
  // Keeps a byte order mark in the text, so JSON.parse rejects it as it does for a Buffer.
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true })
  let text = ""
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new ResponseTooLargeError()
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  return JSON.parse(text + decoder.decode()) as unknown
}
