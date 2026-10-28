function catalog(request: Request) {
  const origin = process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).origin
    : new URL(request.url).origin
  const anchor = `${origin}/.well-known/api-catalog`
  return {
    anchor,
    document: {
      linkset: [
        {
          anchor,
          item: [
            { href: `${origin}/api/v1/me`, title: "Sniptide token API v1" },
            { href: `${origin}/api/mcp`, title: "Sniptide MCP" },
          ],
        },
        {
          anchor: `${origin}/api/v1/me`,
          "service-desc": [
            { href: `${origin}/api/openapi.json`, type: "application/vnd.oai.openapi+json" },
          ],
          "service-doc": [{ href: `${origin}/docs/api`, type: "text/html" }],
          "service-meta": [
            { href: "https://docs.sniptide.com/api-reliability", type: "text/html" },
          ],
        },
        {
          anchor: `${origin}/api/mcp`,
          "service-doc": [{ href: "https://docs.sniptide.com/mcp", type: "text/html" }],
        },
      ],
    },
  }
}
export function GET(request: Request) {
  const { anchor, document } = catalog(request)
  return new Response(JSON.stringify(document), {
    headers: {
      "content-type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      "cache-control": "public, max-age=3600",
      link: `<${anchor}>; rel="api-catalog"`,
    },
  })
}
export function HEAD(request: Request) {
  const response = GET(request)
  return new Response(null, { headers: response.headers })
}
