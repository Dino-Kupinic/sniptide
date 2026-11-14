import { describe, expect, test } from "bun:test"
import { createTelemetry, HOSTED_INSTANCE } from "../src/lib/telemetry"

function setup(options: { key?: string; enabled?: boolean; online?: boolean } = {}) {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = []
  const stored = new Map<string, unknown>()
  const flags = { enabled: options.enabled ?? true, online: options.online ?? true }
  const telemetry = createTelemetry({
    key: options.key ?? "phc_test",
    host: "https://app.sniptide.com/api/analytics",
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!flags.online) throw new TypeError("offline")
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response("{}")
    }) as typeof fetch,
    enabled: () => flags.enabled,
    state: {
      get: (key) => stored.get(key),
      update: async (key, value) => {
        stored.set(key, value)
      },
    },
    properties: { editor: "Cursor", extension_version: "0.1.0" },
  })
  return { telemetry, sent, flags }
}

describe("installed", () => {
  test("reports the install once, with nothing that identifies the reader", async () => {
    const { telemetry, sent } = setup()
    await telemetry.installed()
    await telemetry.installed()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe("https://app.sniptide.com/api/analytics/i/v0/e/")
    expect(sent[0]?.body).toEqual({
      api_key: "phc_test",
      event: "vscode_extension_installed",
      distinct_id: expect.stringMatching(/^[\da-f-]{36}$/),
      properties: {
        editor: "Cursor",
        extension_version: "0.1.0",
        surface: "vscode",
        $process_person_profile: false,
      },
    })
  })

  test("tries again on a later start when the first attempt couldn't be sent", async () => {
    const { telemetry, sent, flags } = setup({ online: false })
    await telemetry.installed()
    flags.online = true
    await telemetry.installed()
    expect(sent).toHaveLength(1)
  })
})

describe("connected", () => {
  test("says how the account connected and whether the instance is sniptide.com", async () => {
    const { telemetry, sent } = setup()
    await telemetry.connected("oauth", HOSTED_INSTANCE)
    await telemetry.connected("token", "https://paste.example.com")
    expect(sent.map(({ body }) => body.properties)).toMatchObject([
      { method: "oauth", hosted: true },
      { method: "token", hosted: false },
    ])
    expect(JSON.stringify(sent)).not.toContain("paste.example.com")
  })

  test("uses one ID for every event from this install", async () => {
    const { telemetry, sent } = setup()
    await telemetry.installed()
    await telemetry.connected("oauth", HOSTED_INSTANCE)
    expect(sent[0]?.body.distinct_id).toBe(sent[1]?.body.distinct_id)
  })
})

describe("sending nothing", () => {
  test("when the build has no PostHog key", async () => {
    const { telemetry, sent } = setup({ key: "" })
    await telemetry.installed()
    await telemetry.connected("oauth", HOSTED_INSTANCE)
    expect(sent).toEqual([])
  })

  test("while telemetry is off in the editor, and reporting the install once it is on", async () => {
    const { telemetry, sent, flags } = setup({ enabled: false })
    await telemetry.installed()
    await telemetry.connected("oauth", HOSTED_INSTANCE)
    expect(sent).toEqual([])
    flags.enabled = true
    await telemetry.installed()
    expect(sent.map(({ body }) => body.event)).toEqual(["vscode_extension_installed"])
  })
})
