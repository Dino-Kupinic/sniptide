// Two anonymous product events, sent to Sniptide's PostHog project: one when the extension is
// first installed and one each time an account connects. They hold no code, file names, titles,
// links or instance addresses. Nothing is sent when the build has no PostHog key, as in a
// development build, or when telemetry is turned off in the editor.

export interface TelemetryDeps {
  // The PostHog project key, set when the release is built. Empty turns telemetry off.
  key: string
  // Where events go: the app's same-origin PostHog proxy, which knows the project's region.
  host: string
  fetch: typeof fetch
  // The editor's telemetry setting, read before every event.
  enabled(): boolean
  // Values that survive restarts, such as the editor's global state.
  state: { get(key: string): unknown; update(key: string, value: unknown): PromiseLike<void> }
  // Sent with every event: the editor's name and the extension's version.
  properties: Record<string, string>
}

export const HOSTED_INSTANCE = "https://app.sniptide.com"
const ID_KEY = "sniptide.telemetry.id"
const INSTALLED_KEY = "sniptide.telemetry.installed"

export function createTelemetry(deps: TelemetryDeps) {
  // A random ID made for this purpose. It isn't the editor's machine ID and isn't tied to the
  // Sniptide account, so events can be counted and nothing else.
  async function distinctId() {
    const stored = deps.state.get(ID_KEY)
    if (typeof stored === "string" && stored) return stored
    const id = crypto.randomUUID()
    await deps.state.update(ID_KEY, id)
    return id
  }

  async function capture(event: string, properties: Record<string, string | boolean> = {}) {
    if (!deps.key || !deps.enabled()) return false
    try {
      const response = await deps.fetch(`${deps.host}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: deps.key,
          event,
          distinct_id: await distinctId(),
          properties: {
            ...deps.properties,
            ...properties,
            surface: "vscode",
            $process_person_profile: false,
          },
        }),
      })
      return response.ok
    } catch {
      // Analytics never gets in the way of the editor.
      return false
    }
  }

  return {
    // Reports the install once. A failed or switched-off attempt is tried again on a later start.
    async installed() {
      if (deps.state.get(INSTALLED_KEY) === true) return
      if (await capture("vscode_extension_installed")) await deps.state.update(INSTALLED_KEY, true)
    },

    // Reports a sign-in with how it happened, and only whether the instance is sniptide.com.
    async connected(method: "oauth" | "token", instance: string) {
      await capture("vscode_extension_connected", {
        method,
        hosted: instance === HOSTED_INSTANCE,
      })
    },
  }
}

export type Telemetry = ReturnType<typeof createTelemetry>
