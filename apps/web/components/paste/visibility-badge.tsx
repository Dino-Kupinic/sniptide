import { Badge } from "@workspace/ui/components/badge"
import type { Paste } from "@/lib/pastes/types"

// Burn-after-read wins over visibility, as in the paste tables of the designs.
export function VisibilityBadge({ paste }: { paste: Pick<Paste, "visibility" | "burnAfterRead"> }) {
  if (paste.burnAfterRead) return <Badge variant="primary">Burn after read</Badge>
  if (paste.visibility === "public") return <Badge variant="solid">Public</Badge>
  if (paste.visibility === "private") return <Badge variant="muted">Private</Badge>
  return <Badge variant="outline">Unlisted</Badge>
}
