import { describe, expect, it } from "bun:test"
import { GET as authorization } from "@/app/.well-known/oauth-authorization-server/route"
import { GET as resource } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route"

describe("OAuth discovery documentation", () => {
  it("links the authorization and protected resource responses to the canonical OAuth guide", async () => {
    const request = new Request("https://example.com/.well-known/oauth-authorization-server")
    expect((await authorization(request).json()).service_documentation).toBe(
      "https://docs.sniptide.com/oauth",
    )
    for (const path of [[], ["api", "mcp"]]) {
      const response = await resource(request, { params: Promise.resolve({ path }) })
      expect(response.status).toBe(200)
      expect((await response.json()).resource_documentation).toBe("https://docs.sniptide.com/oauth")
    }
  })
})
