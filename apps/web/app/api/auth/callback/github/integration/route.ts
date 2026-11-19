import { handleCallback } from "@/lib/integrations/callback"

export const dynamic = "force-dynamic"

// GitHub only redirects to addresses below an OAuth app's registered callback URL, which for
// Sniptide is the sign-in callback one level up. This route puts the integration's callback there,
// so connecting GitHub works with the OAuth app a server already has for sign-in.
export function GET(request: Request) {
  return handleCallback("github", request)
}
