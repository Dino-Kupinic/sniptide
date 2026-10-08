import type { ViewerSummary } from "@/lib/mock-data"
import { viewerStorage } from "@/lib/mock-data"

interface SessionUser {
  name: string
  email: string
  username?: string | null
  displayUsername?: string | null
  image?: string | null
}

export function initialsFor(name: string) {
  const [first = "", second] = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  const letters = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2)

  return letters.toUpperCase() || "?"
}

// Builds the shell's viewer from the signed-in user. Storage stays mocked until pastes exist.
export function viewerFromUser(user: SessionUser): ViewerSummary {
  const name = user.name || user.displayUsername || user.username || user.email

  return {
    name,
    email: user.email,
    username: user.username ?? null,
    image: user.image ?? null,
    initials: initialsFor(name),
    ...viewerStorage,
  }
}
