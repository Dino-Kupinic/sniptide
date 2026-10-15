import { toast } from "@sniptide/ui/components/toast"

// Shared feedback for actions that have no button or form of their own to report on, like menu
// items. Every such action ends in a success or an error toast, never silence.

export async function copyText(text: string, success = "Link copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(success)
    return true
  } catch {
    toast.error("Couldn't copy. Allow clipboard access and try again.")
    return false
  }
}

// Runs a server action and reports either way. A failure is a throw or an `{ ok: false, error }`
// result; the result's own message wins over the generic one.
export async function runAction<T>(
  action: () => Promise<T>,
  messages: { success?: string; error: string },
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const value = await action()
    if (typeof value === "object" && value !== null && "ok" in value && value.ok === false) {
      const message = "error" in value && typeof value.error === "string" ? value.error : null
      toast.error(message ?? messages.error)
      return { ok: false }
    }
    if (messages.success) toast.success(messages.success)
    return { ok: true, value }
  } catch {
    toast.error(messages.error)
    return { ok: false }
  }
}
