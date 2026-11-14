import * as vscode from "vscode"
import { createAuth } from "./auth"
import { registerCommands } from "./commands"
import { createTelemetry } from "./lib/telemetry"
import { createSnippets } from "./snippets"

// The build replaces this with the PostHog project key of a release, or an empty string.
const POSTHOG_KEY = process.env.SNIPTIDE_POSTHOG_KEY ?? ""
// The app forwards this path to PostHog, so the extension needs no region of its own.
const POSTHOG_HOST = "https://app.sniptide.com/api/analytics"

export async function activate(context: vscode.ExtensionContext) {
  const telemetry = createTelemetry({
    key: POSTHOG_KEY,
    host: POSTHOG_HOST,
    fetch,
    enabled: () => vscode.env.isTelemetryEnabled,
    state: context.globalState,
    properties: {
      editor: vscode.env.appName,
      extension_version: String(context.extension.packageJSON.version),
    },
  })
  const auth = createAuth(context, telemetry)
  const snippets = createSnippets(context, auth)
  registerCommands(context, auth, snippets)
  await auth.refresh()
  void telemetry.installed()
}

export function deactivate() {}
