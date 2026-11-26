import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { abuseReport, moderationEvent, moderationScan, paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { chunk, extractUrls, screeningInput } from "@/lib/moderation/content"
import { decide, THRESHOLDS } from "@/lib/moderation/policy"
import type { Fetcher } from "@/lib/moderation/providers"
import { MAX_ATTEMPTS, retryDelay, runScreening, screen } from "@/lib/moderation/queue"
import { SPAM_REVIEW_SCORE, spamVerdict } from "@/lib/moderation/spam"
import { createPaste, updatePaste, updateSharing } from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

// Every fixture is synthetic. Classifier responses are scripted, so no test sends anything to a
// provider and no prohibited material is needed to exercise the rules.

const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  Buffer.alloc(200, 7),
]).toString("base64")
const KEYS = [
  "MODERATION_OPENAI_API_KEY",
  "MODERATION_MISTRAL_API_KEY",
  "MODERATION_WEB_RISK_API_KEY",
]

type Call = { url: string; body: unknown }
function scripted(
  respond: (url: string, body: { input?: unknown[] } | null) => Response | Promise<Response>,
) {
  const calls: Call[] = []
  const fetcher: Fetcher = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, body })
    return respond(url, body)
  }
  return { fetcher, calls }
}
function moderation(scores: Record<string, number>, flagged: string[] = []) {
  return (_url: string, body: { input?: unknown[] } | null) =>
    Response.json({
      results: (body?.input ?? []).map(() => ({
        flagged: flagged.length > 0,
        categories: Object.fromEntries(flagged.map((category) => [category, true])),
        category_scores: scores,
      })),
    })
}
const keys = (set: { openai?: string; mistral?: string; webRisk?: string }) => ({
  openai: undefined,
  mistral: undefined,
  webRisk: undefined,
  ...set,
})
const clean = moderation({ sexual: 0.01, "sexual/minors": 0.001, "violence/graphic": 0.01 })

describe("screening input", () => {
  test("covers the title, description, file names and contents without truncating", () => {
    const long = "x".repeat(20_000)
    const input = screeningInput({
      title: "T",
      description: "D",
      files: [{ name: "a.ts", content: long }],
    })
    const joined = input.chunks.join("")
    expect(joined).toContain("Title:\nT")
    expect(joined).toContain("Description:\nD")
    expect(joined).toContain("File name:\na.ts")
    expect(joined.split("x").length - 1).toBe(20_000)
    expect(input.chunks.every((part) => part.length <= 8_000)).toBe(true)
  })

  test("removes embedded images so they are never sent", () => {
    const input = screeningInput({
      title: "img",
      description: "",
      files: [{ name: "a.md", content: `![x](data:image/png;base64,${PNG})\nraw ${PNG}` }],
    })
    expect(input.imagesRemoved).toBe(2)
    expect(input.chunks.join("")).not.toContain(PNG.slice(0, 40))
  })

  test("screens readable text hidden in base64", () => {
    const hidden = Buffer.from(`hidden words ${"lorem ipsum ".repeat(20)}`).toString("base64")
    const input = screeningInput({
      title: "b",
      description: "",
      files: [{ name: "a", content: hidden }],
    })
    expect(input.chunks.join("")).toContain("decoded base64")
    expect(input.chunks.join("")).toContain("hidden words")
  })

  test("extracts links without fetching them and never splits a surrogate pair", () => {
    expect(extractUrls("see https://example.com/a?b=1#frag, and http://x.test.")).toEqual([
      "https://example.com/a?b=1",
      "http://x.test/",
    ])
    const parts = chunk(`${"a".repeat(7_999)}😀b`)
    expect(parts[0]?.length).toBe(7_999)
    expect(parts.join("")).toBe(`${"a".repeat(7_999)}😀b`)
  })
})

describe("spam heuristics", () => {
  test("leave ordinary code alone", () => {
    const code = Array.from(
      { length: 40 },
      (_, i) => `import { thing${i} } from "./module-${i}"`,
    ).join("\n")
    expect(spamVerdict(code, ["https://github.com/a/b"]).score).toBeLessThan(SPAM_REVIEW_SCORE)
  })

  test("score a link farm with spam terms", () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://bit.ly/x${i}`)
    const text = `best casino bonus, buy followers now ${urls.join(" ")}`
    const verdict = spamVerdict(text, urls)
    expect(verdict.score).toBeGreaterThanOrEqual(SPAM_REVIEW_SCORE)
    expect(verdict.reasons.join(" ")).toContain("shortened links")
  })
})

describe("policy", () => {
  const spam = { score: 0, reasons: [] }
  const openai = (scores: Record<string, number>, flagged: string[] = []) => ({
    provider: "openai" as const,
    model: "omni-moderation-latest",
    scores,
    flagged,
  })

  test("restricts suspected child exploitation at a low score", () => {
    const [finding] = decide({
      text: openai({ "sexual/minors": THRESHOLDS.minors }),
      threats: [],
      spam,
    })
    expect(finding).toMatchObject({ category: "child_exploitation", quarantine: true })
  })

  test("restricts confident sexual and graphic results and only reviews the rest", () => {
    const findings = decide({
      text: openai({ sexual: 0.95, "violence/graphic": 0.5, harassment: 0.7 }, [
        "harassment",
        "violence/graphic",
      ]),
      threats: [],
      spam,
    })
    expect(findings.map((f) => [f.category, f.quarantine])).toEqual([
      ["sexual_content", true],
      ["harassment", false],
      ["graphic_violence", false],
    ])
  })

  test("restricts Web Risk matches and reviews spam", () => {
    const findings = decide({
      text: null,
      threats: ["MALWARE"],
      spam: { score: 6, reasons: ["dense links"] },
    })
    expect(findings.map((f) => [f.category, f.quarantine])).toEqual([
      ["malware", true],
      ["other", false],
    ])
  })
})

describe("providers", () => {
  const paste = {
    title: "t",
    description: "",
    files: [{ name: "a", content: "see https://evil.test/x" }],
  }

  test("sends text parts only to OpenAI and looks links up in Web Risk", async () => {
    const { fetcher, calls } = scripted((url, body) =>
      url.includes("webrisk")
        ? Response.json({ threat: { threatTypes: ["SOCIAL_ENGINEERING"] } })
        : clean(url, body),
    )
    const { result } = await screen(keys({ openai: "sk", webRisk: "wr" }), fetcher, paste)
    const openai = calls.find((call) => call.url.includes("openai"))
    expect(openai?.body).toMatchObject({ model: "omni-moderation-latest" })
    expect(
      ((openai?.body ?? { input: [] }) as { input: { type: string }[] }).input.every(
        (part) => part.type === "text",
      ),
    ).toBe(true)
    expect(calls.find((call) => call.url.includes("webrisk"))?.url).toContain(
      "uri=https%3A%2F%2Fevil.test%2Fx",
    )
    expect(result).toMatchObject({
      action: "quarantine",
      links: { threats: ["SOCIAL_ENGINEERING"] },
    })
  })

  test("falls back to Mistral when OpenAI fails", async () => {
    const { fetcher, calls } = scripted((url, body) =>
      url.includes("openai") ? new Response("down", { status: 503 }) : clean(url, body),
    )
    const { result } = await screen(keys({ openai: "sk", mistral: "ms" }), fetcher, paste)
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual([
      "api.openai.com",
      "api.mistral.ai",
    ])
    expect(result.text?.provider).toBe("mistral")
  })

  test("throws when every text provider fails, so the paste is retried", async () => {
    const { fetcher } = scripted(() => new Response("down", { status: 500 }))
    await expect(screen(keys({ openai: "sk", mistral: "ms" }), fetcher, paste)).rejects.toThrow(
      "mistral: 500",
    )
  })
})

describe("retry schedule", () => {
  test("backs off and caps at two hours", () => {
    expect(retryDelay(1)).toBe(60_000)
    expect(retryDelay(3)).toBe(240_000)
    expect(retryDelay(20)).toBe(120 * 60_000)
  })
})

describe("configuration", () => {
  test("is off without a provider key", () => {
    expect(getConfig({}).moderation).toBeUndefined()
    expect(getConfig({ MODERATION_WEB_RISK_API_KEY: "k" }).moderation).toEqual({
      openai: undefined,
      mistral: undefined,
      webRisk: "k",
    })
  })
})

const describeDb = hasDatabase ? describe : describe.skip
const input = (visibility: PasteInput["visibility"], content = "hello world"): PasteInput => ({
  title: "Greeting",
  description: "",
  slug: "",
  visibility,
  expiry: "never",
  collection: null,
  password: null,
  burnAfterRead: false,
  files: [{ name: "a.txt", language: "text", content }],
})
async function scan(pasteId: string) {
  const [row] = await getDb()
    .select()
    .from(moderationScan)
    .where(eq(moderationScan.pasteId, pasteId))
  return row ?? null
}
async function state(pasteId: string) {
  const [row] = await getDb().select().from(paste).where(eq(paste.id, pasteId))
  return row?.moderationState
}
async function idOf(slug: string) {
  const [row] = await getDb().select({ id: paste.id }).from(paste).where(eq(paste.slug, slug))
  if (!row) throw new Error("missing paste")
  return row.id
}

describeDb("screening queue", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
    process.env.MODERATION_OPENAI_API_KEY = "sk-test"
  })
  afterEach(() => {
    for (const key of KEYS) delete process.env[key]
  })

  test("queues public and unlisted pastes and never private ones", async () => {
    const shared = await idOf((await createPaste(input("unlisted"))).slug)
    const hidden = await idOf((await createPaste(input("private"))).slug)
    expect(await scan(shared)).toMatchObject({ status: "queued" })
    expect(await scan(hidden)).toBeNull()

    const { fetcher, calls } = scripted(clean)
    expect(await runScreening({ fetcher })).toMatchObject({ screened: 1 })
    expect(calls).toHaveLength(1)
    expect(await scan(shared)).toMatchObject({ status: "done", result: { action: "none" } })

    await updateSharing(
      (await getDb().select().from(paste).where(eq(paste.id, shared)))[0]?.slug ?? "",
      {
        visibility: "private",
      },
    )
    expect(await scan(shared)).toBeNull()
  })

  test("queues nothing when screening is off", async () => {
    delete process.env.MODERATION_OPENAI_API_KEY
    const id = await idOf((await createPaste(input("public"))).slug)
    expect(await scan(id)).toBeNull()
    expect(await runScreening()).toBeNull()
  })

  test("quarantines a confident result and files an urgent report", async () => {
    const id = await idOf((await createPaste(input("public"))).slug)
    const { fetcher } = scripted(moderation({ "sexual/minors": 0.9 }, ["sexual/minors"]))
    await runScreening({ fetcher })
    expect(await state(id)).toBe("quarantined")
    const reports = await getDb().select().from(abuseReport).where(eq(abuseReport.pasteId, id))
    expect(reports.map((r) => r.category)).toEqual(["child_exploitation"])
    expect(reports[0]?.explanation).not.toContain("hello world")
    const [event] = await getDb()
      .select()
      .from(moderationEvent)
      .where(eq(moderationEvent.pasteId, id))
    expect(event).toMatchObject({
      actor: "automated-screening:openai",
      caseReference: reports[0]?.id,
    })
  })

  test("sends uncertain results to review and leaves the paste readable", async () => {
    const id = await idOf((await createPaste(input("public"))).slug)
    const { fetcher } = scripted(moderation({ harassment: 0.6 }, ["harassment"]))
    await runScreening({ fetcher })
    expect(await state(id)).toBe("allowed")
    const reports = await getDb().select().from(abuseReport).where(eq(abuseReport.pasteId, id))
    expect(reports.map((r) => r.category)).toEqual(["harassment"])
  })

  test("fails open, retries later and goes to review after the last attempt", async () => {
    const id = await idOf((await createPaste(input("public"))).slug)
    const { fetcher } = scripted(() => new Response("down", { status: 503 }))
    expect(await runScreening({ fetcher })).toMatchObject({ retry: 1 })
    expect(await state(id)).toBe("allowed")
    const row = await scan(id)
    expect(row).toMatchObject({ status: "queued", attempts: 1, lastError: "openai: 503" })
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())

    await getDb()
      .update(moderationScan)
      .set({ attempts: MAX_ATTEMPTS - 1, nextAttemptAt: new Date(0) })
    expect(await runScreening({ fetcher })).toMatchObject({ failed: 1 })
    expect(await scan(id)).toMatchObject({ status: "failed" })
    const reports = await getDb().select().from(abuseReport).where(eq(abuseReport.pasteId, id))
    expect(reports[0]?.explanation).toContain("screening did not complete")
  })

  test("drops a result for content that changed while it was screened", async () => {
    const { slug } = await createPaste(input("public"))
    const id = await idOf(slug)
    let edited = false
    const { fetcher } = scripted(async (url, body) => {
      if (!edited) {
        edited = true
        await updatePaste(slug, input("public", "edited content"), "Edited")
      }
      return moderation({ sexual: 0.99 }, ["sexual"])(url, body)
    })
    expect(await runScreening({ fetcher })).toMatchObject({ stale: 1 })
    expect(await state(id)).toBe("allowed")
    expect(await scan(id)).toMatchObject({ status: "queued", attempts: 0 })
  })
})
