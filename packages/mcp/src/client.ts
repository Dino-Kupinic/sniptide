import { normalizeBaseUrl as normalize, readJson } from "@sniptide/contracts/http"
import {
  type Capture,
  type CollectionPage,
  type Data,
  type Search,
  type Settings,
  type SniptideBackend,
  ToolError,
} from "./server"

export function normalizeBaseUrl(value: string) {
  return normalize(value, ToolError)
}
function record(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ToolError("Sniptide returned an invalid response.")
  return value as Data
}
export class TokenApiBackend implements SniptideBackend {
  private baseUrl: string
  constructor(
    baseUrl: string,
    private token: string,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    if (!/^snpt_[A-Za-z0-9_-]{11,123}$/.test(token))
      throw new ToolError("Set SNIPTIDE_TOKEN to a personal API token from Settings → API tokens.")
  }
  private async request(
    endpoint: string,
    body?: Capture | Settings | { name: string },
    method = body ? "POST" : "GET",
  ): Promise<Data> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/v1/${endpoint}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "application/json",
          // Lets the server record that a paste came through the MCP server.
          "x-sniptide-client": "mcp",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      throw new ToolError("Cannot reach Sniptide. Check the instance URL and connection.")
    }
    if (!response.ok) {
      await response.body?.cancel()
      const messages: Record<number, string> = {
        400: "Sniptide rejected the input. Check the snippet fields and cursor.",
        401: "The API token is invalid, expired or revoked.",
        403: "The API token lacks the required scope.",
        404: "The snippet or collection doesn't exist or isn't yours.",
        409: "You already have a collection with that name.",
        422: "The account already has the most collections it can hold.",
        413: "The request or account storage exceeds the instance's limit.",
        429: "Too many requests. Wait before trying again.",
      }
      throw new ToolError(
        messages[response.status] ??
          (response.status >= 300 && response.status < 400
            ? "Sniptide redirected the request. Set its final instance URL explicitly."
            : `Sniptide returned HTTP ${response.status}.`),
      )
    }
    try {
      return record(await readJson(response))
    } catch {
      throw new ToolError("Sniptide returned an invalid or oversized response.")
    }
  }
  search(input: Search) {
    const params = new URLSearchParams()
    if (input.query) params.set("q", input.query)
    for (const tag of input.tags ?? []) params.append("tag", tag)
    for (const key of ["language", "collection", "limit", "cursor"] as const)
      if (input[key] != null) params.set(key, String(input[key]))
    return this.request(`pastes?${params}`)
  }
  read(id: string) {
    return this.request(`pastes/${encodeURIComponent(id)}`)
  }
  async collection(slug: string, cursor: string | null): Promise<CollectionPage> {
    const page = await this.request(
      `collections/${encodeURIComponent(slug)}/pastes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    )
    if (
      !Array.isArray(page.pastes) ||
      (page.nextCursor !== null && typeof page.nextCursor !== "string")
    )
      throw new ToolError("Sniptide returned an invalid collection page.")
    return { pastes: page.pastes.map(record), nextCursor: page.nextCursor }
  }
  create(input: Capture) {
    return this.request("pastes", input)
  }
  update(id: string, input: Capture) {
    return this.request(`pastes/${encodeURIComponent(id)}`, input, "PUT")
  }
  collections() {
    return this.request("collections")
  }
  createCollection(name: string) {
    return this.request("collections", { name })
  }
  updateSettings(id: string, input: Settings) {
    return this.request(`pastes/${encodeURIComponent(id)}`, input, "PATCH")
  }
  trash(id: string) {
    return this.request(`pastes/${encodeURIComponent(id)}`, undefined, "DELETE")
  }
}
