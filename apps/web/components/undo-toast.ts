import { toast } from "@sniptide/ui/components/toast"
import { runAction } from "@/lib/feedback"

// The toast's Undo lasts this long. The action has already happened (soft-deleted, unlinked,
// moved), so Undo only has to reverse it.
const UNDO_DURATION = 8000

// Shows a success toast with an Undo button, since the action already happened. Undo runs `undo`, reports a failure as an error
// toast, and calls `onUndone` after it works. Returns the toast's id.
export function showUndo({
  message,
  undo,
  onUndone,
  labels,
}: {
  message: string
  undo: () => Promise<unknown>
  onUndone?: () => void
  labels: { undo: string; error: string }
}) {
  return toast.success(message, {
    duration: UNDO_DURATION,
    action: {
      label: labels.undo,
      run: async () => {
        const result = await runAction(undo, { error: labels.error })
        if (result.ok) onUndone?.()
      },
    },
  })
}

// Runs an action that can be taken back. On success the Undo toast appears; on failure the error
// toast says why, and no Undo is offered for something that didn't happen.
export function withUndo<T>(
  action: () => Promise<T>,
  options: Parameters<typeof showUndo>[0] & { error: string },
) {
  const { error, ...undo } = options
  return runAction(action, { error }).then((result) => {
    if (result.ok) showUndo(undo)
    return result
  })
}
