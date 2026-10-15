import { TOAST_ACTION_TIMEOUT, toast } from "@sniptide/ui/components/toast"

// An undo callback reports success by returning anything but a server action's `{ ok: false, error }`.
function failureOf(outcome: unknown) {
  if (typeof outcome !== "object" || outcome === null) return null
  if (!("ok" in outcome) || outcome.ok !== false) return null
  return "error" in outcome && typeof outcome.error === "string" ? outcome.error : "Try again."
}

// Confirms a destructive action with a toast whose Undo puts things back. The action has already
// happened (soft-deleted, unlinked, moved), so Undo only has to reverse it; it stays up for
// TOAST_ACTION_TIMEOUT, and hovering or focusing it pauses the clock.
export function showUndo({
  title,
  description,
  undo,
  onUndone,
}: {
  title: string
  description?: string
  undo: () => Promise<unknown>
  // Runs after a successful undo, e.g. to go back to the page the action closed.
  onUndone?: () => void
}) {
  const id = toast.add({
    title,
    description,
    timeout: TOAST_ACTION_TIMEOUT,
    actionProps: {
      children: "Undo",
      onClick: async () => {
        toast.close(id)
        let failure: string | null = null
        try {
          failure = failureOf(await undo())
        } catch {
          failure = "Something went wrong. Try again."
        }
        if (failure === null) onUndone?.()
        else toast.add({ title: "Couldn't undo", description: failure, type: "error" })
      },
    },
  })
  return id
}
