// The largest request that may carry a paste, through the REST API or a Server Action from the
// editor. Paste content arrives JSON-encoded, so escaped quotes, newlines and tabs can double its
// size on the wire, and an encrypted paste grows by a third as base64. 8 MB leaves room for a
// paste at the default 1 MB limit and for MAX_PASTE_SIZE values up to about 4 MB.
export const PASTE_REQUEST_BYTES = 8 * 1024 * 1024

export class BodyTooLargeError extends Error {
  constructor() {
    super("The request body is too large.")
  }
}

export async function readBody(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  const stream = request.body
  if (Number(request.headers.get("content-length")) > maxBytes) {
    if (stream) void stream.cancel().catch(() => {})
    throw new BodyTooLargeError()
  }
  if (!stream) return new ArrayBuffer(0)

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new BodyTooLargeError()
      chunks.push(value)
    }
  } catch (error) {
    // Cancellation may wait on an unresponsive source. Refuse the request immediately.
    void reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer
}
