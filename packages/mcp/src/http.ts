import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { createSniptideServer, type SniptideBackend } from "./server"

// Each authenticated request gets its own server and backend, never another account's state.
export async function handleMcpRequest(request: Request, backend: SniptideBackend) {
  const server = createSniptideServer(backend)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 8 * 1024 * 1024,
  })
  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    response.headers.set("cache-control", "private, no-store")
    return response
  } finally {
    await server.close()
  }
}
