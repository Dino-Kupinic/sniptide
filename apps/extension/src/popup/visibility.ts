import type { Visibility } from "@sniptide/sdk"
import { messages } from "../lib/messages"

// The order the app's own control uses.
export const visibilityOptions: { value: Visibility; label: string }[] = [
  { value: "private", label: messages.private },
  { value: "unlisted", label: messages.unlisted },
  { value: "public", label: messages.public },
]
