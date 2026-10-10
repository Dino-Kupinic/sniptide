import { initials } from "@/lib/format"
import { viewerStorage } from "@/lib/mock-data"

// The signed-in account as the shell shows it.
export interface ViewerSummary {
  name: string
  email: string
  username: string | null
  image: string | null
  initials: string
  storageUsedMb: number
  storageLimitMb: number
}

interface SessionUser {
  name: string
  email: string
  username?: string | null
  displayUsername?: string | null
  image?: string | null
}

// Builds the shell's viewer from the signed-in user. Storage stays mocked until pastes exist.
export function viewerFromUser(user: SessionUser): ViewerSummary {
  const name = user.name || user.displayUsername || user.username || user.email

  return {
    name,
    email: user.email,
    username: user.username ?? null,
    image: user.image ?? null,
    initials: initials(name),
    ...viewerStorage,
  }
}
