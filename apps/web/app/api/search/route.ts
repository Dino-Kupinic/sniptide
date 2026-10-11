import { searchOwnPastes } from "@/lib/pastes/store"
import { PASTE_SEARCH_LIMIT } from "@/lib/pastes/types"

// Pastes for the ⌘K command menu. A route rather than a Server Action because actions are sent one
// at a time, and a search runs on every pause in typing. Signed out, or with an empty query, the
// answer is empty.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const result = await searchOwnPastes(params.get("q") ?? "", PASTE_SEARCH_LIMIT)
  return Response.json(result, { headers: { "cache-control": "private, no-store" } })
}
