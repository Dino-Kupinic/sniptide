import { SniptideError } from "@sniptide/sdk"
import { OAuthError } from "@workspace/oauth-client"
import * as vscode from "vscode"
import { messages } from "./lib/messages"
import { SignedOutError } from "./lib/session"
import { ShareOptionsError } from "./lib/share"

// The sentence to show for a failure. Sniptide's own errors already say what went wrong.
export function describe(error: unknown) {
  if (
    error instanceof OAuthError ||
    error instanceof SignedOutError ||
    error instanceof ShareOptionsError
  )
    return error.message
  if (error instanceof SniptideError) {
    if (error.code === "network_error") return messages.unreachable
    if (error.status === 403) return messages.readOnly
    if (error.status) return error.message
  }
  return messages.unexpected
}

// Shows a failure. A session that ended offers the way back in.
export async function report(error: unknown) {
  if (error instanceof SignedOutError) {
    const choice = await vscode.window.showErrorMessage(error.message, messages.signIn)
    if (choice) await vscode.commands.executeCommand("sniptide.signIn")
    return
  }
  await vscode.window.showErrorMessage(describe(error))
}
