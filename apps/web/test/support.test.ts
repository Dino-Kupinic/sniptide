import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type Anthropic from "@anthropic-ai/sdk"
import { answer, conversationSchema, refusalFallback, transcript } from "@/lib/support/assistant"
import { docsText, loadDocs, pageUrl, parsePage } from "@/lib/support/docs"
import { submitReport } from "@/lib/support/intake"
import { resetLinearCache } from "@/lib/support/linear"
import {
  dedupeSource,
  githubDraftUrl,
  isHostedInstance,
  type ReportContext,
  redactUrl,
  reportMarkdown,
  reportTitle,
  routePattern,
} from "@/lib/support/report"

const context: ReportContext = {
  url: "https://app.sniptide.com/pastes/k3j2h/edit?q=secret#key",
  browser: "Mozilla/5.0 Test",
  version: "1.2.3",
  userId: "user_1",
  instance: "hosted",
}

const allow = (async () => ({ allowed: true, quotas: [] })) as never
const refuse = (async () => ({ allowed: false, retryAfterSeconds: 120, quotas: [] })) as never

describe("report contents", () => {
  test("drop the query and fragment from the page address", () => {
    expect(redactUrl(context.url)).toBe("https://app.sniptide.com/pastes/k3j2h/edit")
    expect(redactUrl("not a url")).toBe("")
    const body = reportMarkdown({ kind: "bug", description: "Broken", context })
    expect(body).not.toContain("secret")
    expect(body).not.toContain("#key")
    expect(body).toContain("- User ID: user_1")
    expect(body).toContain("- Instance: hosted")
  })

  test("group reports by screen, not by slug", () => {
    expect(routePattern(context.url)).toBe("/pastes/:slug/edit")
    expect(routePattern("https://x.test/")).toBe("/")
    expect(dedupeSource("bug", context.url, "The  editor CRASHES!")).toBe(
      dedupeSource("bug", "https://app.sniptide.com/pastes/other/edit", "the editor crashes"),
    )
    expect(dedupeSource("bug", context.url, "x")).not.toBe(
      dedupeSource("feedback", context.url, "x"),
    )
  })

  test("title an issue with the first line of the description", () => {
    expect(reportTitle("bug", "\n  Copy button   does nothing\nmore")).toBe(
      "Bug: Copy button does nothing",
    )
    expect(reportTitle("feedback", "")).toBe("Feedback: No description")
    expect(reportTitle("bug", "a".repeat(200)).length).toBeLessThanOrEqual(85)
  })

  test("only the hosted app counts as hosted", () => {
    expect(isHostedInstance("https://app.sniptide.com")).toBe(true)
    expect(isHostedInstance("https://paste.example.com")).toBe(false)
    expect(isHostedInstance(undefined)).toBe(false)
  })

  test("build a GitHub draft only for GitHub issue links within the length limit", () => {
    const url = githubDraftUrl("https://github.com/acme/paste/issues", "Bug: ü", "body")
    expect(url).toStartWith("https://github.com/acme/paste/issues/new?")
    expect(new URL(url ?? "").searchParams.get("title")).toBe("Bug: ü")
    expect(githubDraftUrl("https://example.com/support", "t", "b")).toBeNull()
    expect(githubDraftUrl("https://github.com/acme/paste/issues", "t", "ü".repeat(4000))).toBeNull()
  })
})

// A fake Linear GraphQL endpoint that records what was asked.
function fakeLinear(options: { existing?: boolean } = {}) {
  const calls: { query: string; variables: Record<string, unknown> }[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith("https://uploads.linear.test")) return new Response(null, { status: 200 })
    const { query, variables } = JSON.parse(String(init?.body))
    calls.push({ query, variables })
    const data = query.includes("teams(")
      ? { teams: { nodes: [{ id: "team-uuid" }] } }
      : query.includes("query Workspace")
        ? {
            team: { states: { nodes: [{ id: "triage-state" }] } },
            issueLabels: {
              nodes: [
                { id: "other-team-bug", name: "Bug", team: { id: "someone-else" } },
                { id: "bug-label", name: "Bug", team: { id: "team-uuid" } },
                { id: "feedback-label", name: "Feedback", team: null },
              ],
            },
          }
        : query.includes("query Existing")
          ? {
              issues: {
                nodes: options.existing
                  ? [{ id: "issue-1", identifier: "WRK-1", url: "https://linear.app/x/WRK-1" }]
                  : [],
              },
            }
          : query.includes("fileUpload")
            ? {
                fileUpload: {
                  uploadFile: {
                    uploadUrl: "https://uploads.linear.test/put",
                    assetUrl: "https://uploads.linear.test/asset.png",
                    headers: [{ key: "x-goog-meta", value: "1" }],
                  },
                },
              }
            : query.includes("commentCreate")
              ? { commentCreate: { success: true } }
              : {
                  issueCreate: {
                    issue: {
                      id: "issue-2",
                      identifier: "WRK-2",
                      url: "https://linear.app/x/WRK-2",
                    },
                  },
                }
    return Response.json({ data })
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

describe("filing in Linear", () => {
  let linear: ReturnType<typeof fakeLinear>
  const saved = { ...process.env }

  beforeEach(() => {
    resetLinearCache()
    process.env.LINEAR_API_KEY = "lin_api_test"
    process.env.LINEAR_TEAM_ID = "WRK"
    process.env.LINEAR_PROJECT_ID = "project-uuid"
  })
  afterEach(() => {
    linear?.restore()
    process.env = { ...saved }
  })

  test("is off without a key", async () => {
    delete process.env.LINEAR_API_KEY
    const result = await submitReport({ kind: "bug", description: "x", context, limiter: allow })
    expect(result).toEqual({ ok: false, reason: "not_configured" })
  })

  test("creates a triage issue with the label, project, priority and report key", async () => {
    linear = fakeLinear()
    const result = await submitReport({
      kind: "bug",
      description: "Copy fails\nSteps...",
      context,
      limiter: allow,
    })
    expect(result).toMatchObject({ ok: true, duplicate: false, issue: { identifier: "WRK-2" } })
    const create = linear.calls.find((call) => call.query.includes("issueCreate"))
    const input = create?.variables.input as Record<string, unknown>
    expect(input).toMatchObject({
      teamId: "team-uuid",
      title: "Bug: Copy fails",
      priority: 3,
      labelIds: ["bug-label"],
      projectId: "project-uuid",
      stateId: "triage-state",
    })
    expect(String(input.description)).toMatch(/Report key: [0-9a-f]{16}$/)
    expect(String(input.description)).toContain("App version: 1.2.3")
  })

  test("feedback gets the workspace Feedback label and no priority", async () => {
    linear = fakeLinear()
    await submitReport({ kind: "feedback", description: "Love it", context, limiter: allow })
    const input = linear.calls.find((call) => call.query.includes("issueCreate"))?.variables
      .input as Record<string, unknown>
    expect(input.labelIds).toEqual(["feedback-label"])
    expect(input.priority).toBe(0)
  })

  test("a repeat becomes a comment on the open issue", async () => {
    linear = fakeLinear({ existing: true })
    const result = await submitReport({
      kind: "bug",
      description: "Copy fails",
      context,
      limiter: allow,
    })
    expect(result).toMatchObject({ ok: true, duplicate: true, issue: { identifier: "WRK-1" } })
    expect(linear.calls.some((call) => call.query.includes("issueCreate"))).toBe(false)
    const comment = linear.calls.find((call) => call.query.includes("commentCreate"))
    expect(comment?.variables.input).toMatchObject({ issueId: "issue-1" })
  })

  test("uploads the screenshot and embeds it", async () => {
    linear = fakeLinear()
    const screenshot = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", {
      type: "image/png",
    })
    await submitReport({ kind: "bug", description: "Look", context, screenshot, limiter: allow })
    const input = linear.calls.find((call) => call.query.includes("issueCreate"))?.variables
      .input as Record<string, unknown>
    expect(String(input.description)).toContain(
      "![Screenshot](https://uploads.linear.test/asset.png)",
    )
  })

  test("stops at the hourly limit before calling Linear", async () => {
    linear = fakeLinear()
    const result = await submitReport({ kind: "bug", description: "x", context, limiter: refuse })
    expect(result).toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: 120 })
    expect(linear.calls).toHaveLength(0)
  })

  test("reports a Linear failure without throwing", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      Response.json({ errors: [{ message: "nope" }] }, { status: 400 })) as unknown as typeof fetch
    try {
      const result = await submitReport({ kind: "bug", description: "x", context, limiter: allow })
      expect(result).toEqual({ ok: false, reason: "failed" })
    } finally {
      globalThis.fetch = original
    }
  })
})

describe("documentation corpus", () => {
  test("maps files to docs addresses", () => {
    expect(pageUrl("https://docs.sniptide.com/", "index.mdx")).toBe("https://docs.sniptide.com")
    expect(pageUrl("https://docs.sniptide.com", "core-concepts/index.mdx")).toBe(
      "https://docs.sniptide.com/core-concepts",
    )
    expect(pageUrl("https://docs.sniptide.com", "self-hosting/docker.mdx")).toBe(
      "https://docs.sniptide.com/self-hosting/docker",
    )
  })

  test("keeps the title and drops frontmatter and imports", () => {
    const page = parsePage('---\ntitle: "Pastes"\ndescription: x\n---\nimport A from "b"\n\nBody')
    expect(page).toEqual({ title: "Pastes", body: "Body" })
  })

  test("reads every docs page", async () => {
    const pages = await loadDocs("https://docs.example.com")
    expect(pages.length).toBeGreaterThan(20)
    const troubleshooting = pages.find(
      (page) => page.url === "https://docs.example.com/troubleshooting",
    )
    expect(troubleshooting?.title).toBe("Troubleshooting")
    expect(docsText(pages)).toContain('<page url="https://docs.example.com/troubleshooting"')
  })
})

describe("support assistant", () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  // Replies in order; records each request.
  function fakeClaude(responses: Partial<Anthropic.Beta.BetaMessage>[]) {
    const requests: Record<string, unknown>[] = []
    const api = {
      beta: {
        messages: {
          create: async (body: Record<string, unknown>) => {
            requests.push(structuredClone(body))
            return responses.shift()
          },
        },
      },
    } as unknown as Pick<Anthropic, "beta">
    return { api, requests }
  }

  const question = [{ role: "user" as const, content: "How do I burn a paste?" }]

  test("validates the conversation shape", () => {
    expect(conversationSchema.safeParse(question).success).toBe(true)
    expect(conversationSchema.safeParse([{ role: "assistant", content: "hi" }]).success).toBe(false)
    expect(
      conversationSchema.safeParse([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]).success,
    ).toBe(false)
    expect(
      conversationSchema.safeParse([{ role: "user", content: "x".repeat(5000) }]).success,
    ).toBe(false)
  })

  test("is off without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await answer({ conversation: question, context, limiter: allow })
    expect(result).toEqual({ ok: false, reason: "not_configured" })
  })

  test("answers from the cached docs without the report tool when Linear is off", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    delete process.env.LINEAR_API_KEY
    const { api, requests } = fakeClaude([
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Turn on Burn after read.", citations: null }],
      },
    ])
    const result = await answer({ conversation: question, context, api, limiter: allow })
    expect(result).toEqual({ ok: true, reply: "Turn on Burn after read.", issue: undefined })
    const body = requests[0] as {
      model: string
      tools: unknown[]
      system: { text: string; cache_control?: unknown }[]
      fallbacks: string
    }
    expect(body.model).toBe("claude-haiku-5-5")
    expect(body.tools).toEqual([])
    expect(body.fallbacks).toBeUndefined()
    expect(body.system[0]?.cache_control).toEqual({ type: "ephemeral" })
    expect(body.system[0]?.text).toContain("<documentation>")
    // The per-request context sits after the cache breakpoint, so the cached prefix never changes.
    expect(body.system[0]?.text).not.toContain("user_1")
    expect(body.system[1]?.text).toContain("User ID: user_1")
  })

  test("files a report with the conversation and returns the issue", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    process.env.LINEAR_API_KEY = "lin_api_test"
    process.env.LINEAR_TEAM_ID = "team-uuid"
    resetLinearCache()
    const linear = fakeLinear()
    try {
      const { api, requests } = fakeClaude([
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "report_to_team",
              input: { kind: "bug", summary: "Burning fails on save. Expected the paste to burn." },
            } as Anthropic.Beta.BetaToolUseBlock,
          ],
        },
        {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Filed as WRK-2.", citations: null }],
        },
      ])
      const result = await answer({ conversation: question, context, api, limiter: allow })
      expect(result).toEqual({ ok: true, reply: "Filed as WRK-2.", issue: "WRK-2" })
      const create = linear.calls.find((call) => call.query.includes("issueCreate"))
      const input = create?.variables.input as Record<string, unknown>
      expect(input.title).toBe("Bug: Burning fails on save. Expected the paste to burn.")
      expect(String(input.description)).toContain("**Person:** How do I burn a paste?")
      const second = requests[1] as { messages: { role: string; content: unknown }[] }
      expect(second.messages.at(-1)).toMatchObject({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool_1", is_error: false }],
      })
    } finally {
      linear.restore()
    }
  })

  test("returns an empty reply on a refusal", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    const { api } = fakeClaude([{ stop_reason: "refusal", content: [] }])
    const result = await answer({ conversation: question, context, api, limiter: allow })
    expect(result).toEqual({ ok: true, reply: "", issue: undefined })
  })

  test("asks for a refusal fallback only where the model has one", () => {
    expect(refusalFallback("claude-haiku-5-5")).toEqual({})
    expect(refusalFallback("claude-opus-5-5")).toEqual({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    })
  })

  test("transcripts keep each message on one line", () => {
    expect(transcript([{ role: "user", content: "a\n\nb" }])).toContain("**Person:** a b")
  })
})
