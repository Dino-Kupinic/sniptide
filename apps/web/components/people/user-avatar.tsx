import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { cn } from "@sniptide/ui/lib/utils"
import type { CSSProperties } from "react"

const FILLS = 6

// A stable fill for an account: the same id always lands on the same one of the six pairs.
function avatarFill(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return (Math.abs(hash) % FILLS) + 1
}

// A person's profile picture, or a silhouette on their own colour when they haven't uploaded one.
// The picture is decorative: the name always sits next to it.
export function UserAvatar({
  person,
  className,
}: {
  person: { id: string; image?: string | null }
  className?: string
}) {
  const fill = avatarFill(person.id)
  return (
    <Avatar
      aria-hidden="true"
      className={cn("size-6", className)}
      style={
        {
          backgroundColor: `var(--avatar-${fill})`,
          color: `var(--avatar-${fill}-foreground)`,
        } as CSSProperties
      }
    >
      {person.image ? <AvatarImage src={person.image} alt="" /> : null}
      <AvatarFallback className="size-full">
        <svg viewBox="0 0 32 32" className="size-full" fill="currentColor" aria-hidden="true">
          <circle cx="16" cy="12.5" r="6" />
          <path d="M4 32c0-7.2 5.4-11.5 12-11.5S28 24.8 28 32z" />
        </svg>
      </AvatarFallback>
    </Avatar>
  )
}
