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
