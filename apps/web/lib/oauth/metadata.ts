import { SCOPES } from "@/lib/api/scopes"

// Discovery documents for OAuth: authorization server metadata (RFC 8414) and protected resource
// metadata (RFC 9728). The app is both the authorization server and the resource server, so the
// issuer, the resource and every endpoint share one origin: BETTER_AUTH_URL when it's set, as on
// app.sniptide.com and most self-hosted instances, otherwise the origin the request came to.

export const ACCESS_TOKEN_SECONDS = 60 * 60
export const REFRESH_TOKEN_DAYS = 30
export const CODE_SECONDS = 60 * 10

export function appOrigin(requestUrl: string) {
  return process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).origin
    : new URL(requestUrl).origin
}

export const oauthPaths = {
  authorization: "/oauth/authorize",
  token: "/api/oauth/token",
  registration: "/api/oauth/register",
  revocation: "/api/oauth/revoke",
  authorizationServer: "/.well-known/oauth-authorization-server",
  protectedResource: "/.well-known/oauth-protected-resource",
}

// The protected resource metadata URL for a resource path: the root document for the API as a
// whole, and /.well-known/oauth-protected-resource/api/mcp for the MCP endpoint (RFC 9728 3.1).
export function resourceMetadataUrl(origin: string, resourcePath = "") {
  return `${origin}${oauthPaths.protectedResource}${resourcePath}`
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${oauthPaths.authorization}`,
    token_endpoint: `${origin}${oauthPaths.token}`,
    registration_endpoint: `${origin}${oauthPaths.registration}`,
    revocation_endpoint: `${origin}${oauthPaths.revocation}`,
    scopes_supported: [...SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://docs.sniptide.com/oauth",
  }
}

export function protectedResourceMetadata(origin: string, resourcePath = "") {
  return {
    resource: `${origin}${resourcePath}`,
    resource_name: resourcePath === "/api/mcp" ? "Sniptide MCP server" : "Sniptide API",
    authorization_servers: [origin],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://docs.sniptide.com/oauth",
  }
}

// The WWW-Authenticate challenge on a 401 or a 403 from the API or MCP (RFC 9728 5.1, RFC 6750 3).
export function bearerChallenge(
  requestUrl: string,
  error?: { code: "invalid_token" | "insufficient_scope"; scope?: string },
) {
  const origin = appOrigin(requestUrl)
  const resourcePath = new URL(requestUrl).pathname.startsWith("/api/mcp") ? "/api/mcp" : ""
  const parts = [`resource_metadata="${resourceMetadataUrl(origin, resourcePath)}"`]
  if (error) parts.unshift(`error="${error.code}"`)
  if (error?.scope) parts.push(`scope="${error.scope}"`)
  return `Bearer ${parts.join(", ")}`
}
