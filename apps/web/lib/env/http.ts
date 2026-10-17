import "server-only"

export const secretHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
}
export function secretJson(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { ...secretHeaders, ...headers } })
}
export async function boundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new Error("Request too large.")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing request.")
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.length
      if (length > maxBytes) throw new Error("Request too large.")
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel()
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(result))
}
