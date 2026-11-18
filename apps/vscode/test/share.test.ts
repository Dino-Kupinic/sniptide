import { describe, expect, test } from "bun:test"
import { type CaptureInput, type SniptideClient, SniptideError } from "@sniptide/sdk"
import {
  DEFAULT_OPTIONS,
  rememberedOptions,
  ShareOptionsError,
  share,
  summarize,
} from "../src/lib/share"

const capture: CaptureInput = {
  title: "auth.ts:12-30",
  visibility: "unlisted",
  files: [{ name: "auth.ts", content: "const answer = 42" }],
}

// A client that records what the share asks of Sniptide.
function recorder(options: { settingsFail?: boolean; trashFails?: boolean } = {}) {
  const calls: unknown[][] = []
  const paste = { id: "p1", url: "https://sniptide.test/p1", visibility: "private" }
  const client = {
    async createPaste(input: CaptureInput, key: string) {
      calls.push(["create", input.visibility, key])
      return { paste: { ...paste, visibility: input.visibility } }
    },
    async updateSettings(id: string, settings: object) {
      calls.push(["settings", id, settings])
      if (options.settingsFail) throw new SniptideError("The password is too long.", 422)
      return { paste: { ...paste, ...settings }, settings: {} }
    },
    async trashPaste(id: string) {
      calls.push(["trash", id])
      if (options.trashFails) throw new SniptideError("Cannot reach Sniptide.")
      return { trashed: { id, slug: id } }
    },
  } as unknown as SniptideClient
  const run = <T>(call: (client: SniptideClient) => Promise<T>) => call(client)
  return { calls, run }
}

describe("share", () => {
  test("creates the link in one request when no option needs a second", async () => {
    const { calls, run } = recorder()
    const paste = await share(run, capture, { ...DEFAULT_OPTIONS, visibility: "public" }, "key-1")
    expect(calls).toEqual([["create", "public", "key-1"]])
    expect(paste.url).toBe("https://sniptide.test/p1")
  })

  test("starts private and opens the link in the request that sets its protection", async () => {
    const { calls, run } = recorder()
    const paste = await share(
      run,
      capture,
      { visibility: "unlisted", expiry: "1d", password: "hunter2" },
      "key-1",
    )
    expect(calls).toEqual([
      ["create", "private", "key-1"],
      ["settings", "p1", { visibility: "unlisted", expiry: "1d", password: "hunter2" }],
    ])
    expect(paste.visibility).toBe("unlisted")
  })

  test("sends only the options that were chosen", async () => {
    const { calls, run } = recorder()
    await share(run, capture, { visibility: "public", expiry: "1w", password: null })
    expect(calls[1]).toEqual(["settings", "p1", { visibility: "public", expiry: "1w" }])
  })

  test("moves the paste to the trash when its options can't be set", async () => {
    const { calls, run } = recorder({ settingsFail: true })
    await expect(
      share(run, capture, { visibility: "unlisted", expiry: "never", password: "x" }),
    ).rejects.toBeInstanceOf(ShareOptionsError)
    expect(calls.at(-1)).toEqual(["trash", "p1"])
  })

  test("reports the failed options even when the trash can't be reached", async () => {
    const { run } = recorder({ settingsFail: true, trashFails: true })
    await expect(
      share(run, capture, { visibility: "unlisted", expiry: "1h", password: null }),
    ).rejects.toBeInstanceOf(ShareOptionsError)
  })
})

describe("rememberedOptions", () => {
  test("starts from the last visibility and expiry, never a password", () => {
    expect(rememberedOptions({ visibility: "public", expiry: "1w", password: "old" })).toEqual({
      visibility: "public",
      expiry: "1w",
      password: null,
    })
  })

  test("falls back to an unlisted link that never expires", () => {
    expect(rememberedOptions(undefined)).toEqual(DEFAULT_OPTIONS)
    expect(rememberedOptions({ visibility: "secret", expiry: "2d" })).toEqual(DEFAULT_OPTIONS)
  })
})

test("summarize describes the link the options create", () => {
  expect(summarize(DEFAULT_OPTIONS)).toBe("Unlisted, never expires")
  expect(summarize({ visibility: "public", expiry: "1d", password: "x" })).toBe(
    "Public, expires after 1 day, password protected",
  )
})
