import { initials } from "@/lib/format"
import { viewerStorage } from "@/lib/mock-data"

// The signed-in account as the shell shows it.
export interface ViewerSummary {
  id: string
  name: string
  email: string
  username: string | null
  image: string | null
  initials: string
  storageUsedMb: number
  storageLimitMb: number
}

interface SessionUser {
  id: string
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
    id: user.id,
    name,
    email: user.email,
    username: user.username ?? null,
    image: user.image ?? null,
    initials: initials(name),
    ...viewerStorage,
  }
}

// The name a greeting uses: the first word of the display name.
export function firstName(name: string) {
  return name.split(/[\s._-]/)[0] || "there"
}
