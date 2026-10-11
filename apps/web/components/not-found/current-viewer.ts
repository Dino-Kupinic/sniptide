import { getSession } from "@/lib/auth"
import { type ViewerSummary, viewerFromUser } from "@/lib/viewer"

// The signed-in account, or null for a visitor with no session (or when auth can't be reached),
// who gets the signed-out version of the 404.
export async function currentViewer(): Promise<ViewerSummary | null> {
  try {
    const session = await getSession()

    return session ? viewerFromUser(session.user) : null
  } catch {
    return null
  }
}
