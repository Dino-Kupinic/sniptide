import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { createSniptideServer, type SniptideBackend } from "./server"

// Building a server registers every tool and prompt, which costs about as much as answering a
// call. Idle servers are kept and lent to one request at a time. A lent server reads its backend
// from the request it is serving, and forgets it before it is lent again, so no request can reach
// another account's backend.
interface Lease {
  server: ReturnType<typeof createSniptideServer>
  backend: SniptideBackend | null
}
const MAX_IDLE = 32
const idle: Lease[] = []

function lease(): Lease {
  const kept = idle.pop()
  if (kept) return kept
  const created: Lease = {
    server: createSniptideServer(() => {
      if (!created.backend) throw new Error("This MCP server isn't serving a request.")
      return created.backend
    }),
    backend: null,
  }
  return created
}

export async function handleMcpRequest(request: Request, backend: SniptideBackend) {
  const lent = lease()
  lent.backend = backend
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 8 * 1024 * 1024,
  })
  let reusable = false
  try {
    await lent.server.connect(transport)
    const response = await transport.handleRequest(request)
    response.headers.set("cache-control", "private, no-store")
    reusable = true
    return response
  } finally {
    lent.backend = null
    // A server that failed mid-request, or that won't close, is dropped instead of reused.
    const closed = await lent.server.close().then(
      () => true,
      () => false,
    )
    if (reusable && closed && idle.length < MAX_IDLE) idle.push(lent)
  }
}
