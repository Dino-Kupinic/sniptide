import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { parseStack, scrubErrorText, toExceptionList } from "@/lib/error-scrub"
import { captureServerError, type exceptionEvent, resetErrorBudget } from "@/lib/error-tracking"
import { createJobRunner } from "@/lib/jobs/runner"

// Exceptions reach PostHog only with POSTHOG_KEY, and never carry paste content, slugs, tokens or
// email addresses.

const paste = "const secret = 42 // my private paste"

describe("scrubErrorText", () => {
  test("replaces quoted values, which carry the input that failed", () => {
    expect(scrubErrorText(`invalid input syntax for type uuid: "k7Qe2x"`)).toBe(
      `invalid input syntax for type uuid: "[redacted]"`,
    )
    expect(scrubErrorText(`Unexpected token 'c', "${paste}" is not valid JSON`)).toBe(
      `Unexpected token '[redacted]', "[redacted]" is not valid JSON`,
    )
    expect(scrubErrorText(`Unknown language \`${paste}\``)).toBe("Unknown language `[redacted]`")
  })

  test("drops a failed query's parameters and Postgres key details", () => {
    const message = `Failed query: insert into "paste" ("slug", "content") values ($1, $2)\nparams: k7Qe2x,${paste}`
    const scrubbed = scrubErrorText(message)
    expect(scrubbed).not.toContain("k7Qe2x")
    expect(scrubbed).not.toContain("private paste")
    expect(scrubbed).toEndWith("params: [redacted]")
    expect(scrubErrorText("Key (handle, slug)=(ada, k7Qe2x) already exists.")).toBe(
      "Key (handle, slug)=([redacted]) already exists.",
    )
  })

  test("reduces URLs to their route and removes handles' links", () => {
    expect(scrubErrorText("fetch https://app.sniptide.com/@ada/notes/raw?token=abc#x failed")).toBe(
      "fetch https://app.sniptide.com/@[handle]/[slug]/raw failed",
    )
    expect(scrubErrorText("GET https://sniptide.com/k7Qe2x returned 500")).toBe(
      "GET https://sniptide.com/[slug] returned 500",
    )
    expect(scrubErrorText("no paste at @ada/notes")).toBe("no paste at @[handle]/[slug]")
  })

  test("replaces emails, tokens and credentials", () => {
    const scrubbed = scrubErrorText(
      "user ada.lovelace+test@example.co.uk sent snpt_AbC123xyz and Bearer abc.def and " +
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig and 3f2a9c1b8e7d6a5f4e3d2c1b0a9f8e7d",
    )
    expect(scrubbed).toBe("user [email] sent [token] and [credential] and [token] and [token]")
  })

  test("keeps ordinary messages readable and bounds their length", () => {
    expect(scrubErrorText("Cannot read properties of undefined (reading map)")).toBe(
      "Cannot read properties of undefined (reading map)",
    )
    expect(scrubErrorText("x".repeat(5000)).length).toBeLessThanOrEqual(1001)
  })
})

describe("parseStack", () => {
  test("parses V8 frames oldest first and strips query strings", () => {
    const frames = parseStack(
      [
        "Error: boom",
        "    at loadPaste (/app/.next/server/chunks/ssr/page.js?v=k7Qe2x:12:34)",
        "    at async Page (/app/.next/server/app/page.js:5:6)",
        "    at /app/node_modules/next/dist/server.js:1:2",
        "    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
      ].join("\n"),
    )
    expect(frames.map((frame) => frame.function)).toEqual([
      "process.processTicksAndRejections",
      "?",
      "Page",
      "loadPaste",
    ])
    expect(frames.at(-1)).toEqual({
      platform: "node:javascript",
      filename: "/app/.next/server/chunks/ssr/page.js",
      function: "loadPaste",
      lineno: 12,
      colno: 34,
      in_app: true,
    })
    expect(frames[1]?.in_app).toBe(false)
    expect(
      parseStack("    at f (/app/node_modules/.bun/next@16.2.1+0a1b/node_modules/next/x.js:1:2)")[0]
        ?.filename,
    ).toBe("/app/node_modules/.bun/next@16.2.1+0a1b/node_modules/next/x.js")
    expect(frames[0]?.in_app).toBe(false)
  })
})

describe("toExceptionList", () => {
  test("keeps only the class, scrubbed message and frames of an error and its causes", () => {
    const cause = Object.assign(new Error(`duplicate key "k7Qe2x"`), { detail: paste })
    const error = Object.assign(
      new TypeError(`Failed query: select\nparams: ${paste}`, { cause }),
      {
        paste: { content: paste },
      },
    )
    const list = toExceptionList(error, "onRequestError")
    expect(list.map(({ type, value }) => ({ type, value }))).toEqual([
      { type: "TypeError", value: "Failed query: select\nparams: [redacted]" },
      { type: "Error", value: `duplicate key "[redacted]"` },
    ])
    expect(list[0]?.stacktrace.frames.length).toBeGreaterThan(0)
    expect(JSON.stringify(list)).not.toContain("private paste")
  })

  test("reports thrown non-errors without their value", () => {
    expect(toExceptionList({ content: paste }, "maintenance_job")[0]).toMatchObject({
      type: "Error",
      value: "Non-Error thrown",
      mechanism: { synthetic: true },
    })
  })
})

describe("captureServerError", () => {
  const realFetch = globalThis.fetch
  let sent: { url: string; body: ReturnType<typeof exceptionEvent> }[] = []

  beforeEach(() => {
    sent = []
    resetErrorBudget()
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(null, { status: 200 })
    }) as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.POSTHOG_KEY
    delete process.env.DEPLOYMENT_VERSION
  })

  const request = {
    source: "request",
    route: "/[slug]",
    routeType: "render",
    method: "GET",
    host: "app.sniptide.com",
  } as const

  test("sends nothing without POSTHOG_KEY", async () => {
    await captureServerError(new Error("boom"), request)
    expect(sent).toHaveLength(0)
  })

  test("sends a scrubbed $exception tagged with route, release and runtime", async () => {
    process.env.POSTHOG_KEY = "phc_x"
    process.env.DEPLOYMENT_VERSION = "abc123"
    await captureServerError(
      Object.assign(new Error(`Paste "${paste}" failed to render`), { digest: "123" }),
      request,
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe("https://us.i.posthog.com/i/v0/e/")
    const event = sent[0]?.body
    expect(event).toMatchObject({
      api_key: "phc_x",
      event: "$exception",
      properties: {
        $process_person_profile: false,
        surface: "server",
        source: "request",
        route: "/[slug]",
        route_type: "render",
        method: "GET",
        release: "abc123",
        runtime: "nodejs",
        digest: "123",
      },
    })
    expect(event?.properties.$exception_list[0]?.value).toBe('Paste "[redacted]" failed to render')
    expect(JSON.stringify(event)).not.toContain("private paste")
  })

  test("stays quiet on previews and local development", async () => {
    process.env.POSTHOG_KEY = "phc_x"
    await captureServerError(new Error("boom"), { ...request, host: "pr-12.sniptide.com" })
    await captureServerError(new Error("boom"), { ...request, host: "localhost" })
    expect(sent).toHaveLength(0)
  })

  test("sends at most 30 exceptions a minute and never throws", async () => {
    process.env.POSTHOG_KEY = "phc_x"
    for (let i = 0; i < 40; i++) await captureServerError(new Error("loop"), request)
    expect(sent).toHaveLength(30)
    globalThis.fetch = (async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch
    resetErrorBudget()
    expect(await captureServerError(new Error("boom"), request)).toBeUndefined()
  })

  test("a job that throws reports the error with the job's name", async () => {
    process.env.POSTHOG_KEY = "phc_x"
    const runner = createJobRunner(
      {
        purge: {
          intervalMs: 1000,
          run: () => {
            throw new Error(`could not purge "${paste}"`)
          },
        },
      },
      { onError: (job, error) => captureServerError(error, { source: "job", job }) },
    )
    expect((await runner.run("purge")).failureCode).toBe("execution_failed")
    expect(sent[0]?.body.properties).toMatchObject({ source: "job", job: "purge" })
    expect(sent[0]?.body.properties.$exception_list[0]?.value).toBe('could not purge "[redacted]"')
  })
})
