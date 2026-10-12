import { openApiDocument } from "@/lib/openapi"

// The machine-readable API description behind /docs/api. Public, and the same for everyone, so
// tools can fetch it to generate clients.
export function GET() {
  return Response.json(openApiDocument, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
  })
}
