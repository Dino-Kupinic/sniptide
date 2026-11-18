import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import {
  decryptPayload,
  ENCRYPTED_FILE_NAME,
  encryptPayload,
  generateKey,
  keyIdOf,
} from "@sniptide/contracts/encryption"
import { pasteFile, pasteRevision } from "@workspace/db/schema"
import { GET as preview } from "@/app/[slug]/preview/route"
import { GET as raw } from "@/app/[slug]/raw/route"
import { POST as reveal } from "@/app/[slug]/reveal/route"
import { GET as markdown } from "@/app/api/agent-share/[...path]/route"
import { scrubUrl } from "@/lib/analytics"
import {
  collectionCaptures,
  getCapture,
  listCaptures,
  listQuerySchema,
  trashCapture,
  updateCapture,
  updateSettings,
} from "@/lib/api/pastes"
import { getDb } from "@/lib/db"
import { autosavePaste, savePaste, setPastesVisibility } from "@/lib/pastes/actions"
import { cardPreviews } from "@/lib/pastes/card-preview"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { pasteSchema } from "@/lib/pastes/schema"
import {
  getPaste,
  readEmbedPaste,
  readPublicPreview,
  readSharedPaste,
  readWebhookPaste,
  restoreRevision,
  revealSharedPaste,
  updateSharing,
} from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import { hasDatabase, pasteRow, resetDatabase, seedUser, signInAs } from "./harness"

// What the server does with a paste it can't read. The browser produced the envelope; these
// tests build one the same way and check every server surface around it.

const secret = "API_KEY=sk-live-do-not-leak"
const payload = {
  description: "production credentials",
  files: [{ name: "prod.env", content: secret }],
}

async function encryptedInput(overrides: Partial<PasteInput> = {}) {
  const key = generateKey()
  const input: PasteInput = {
    title: "Deploy notes",
    description: "",
    files: [
      { name: ENCRYPTED_FILE_NAME, language: "text", content: await encryptPayload(payload, key) },
    ],
    visibility: "unlisted",
    expiry: "never",
    slug: "",
    collection: null,
    password: null,
    burnAfterRead: false,
    encryption: { keyId: await keyIdOf(key) },
    ...overrides,
  }
  return { key, input }
}

const context = (slug: string) => ({ params: Promise.resolve({ slug }) })

describe("validation", () => {
  test("accepts one envelope and nothing readable beside the title", async () => {
    const { input } = await encryptedInput()
    expect(pasteSchema.safeParse(input).success).toBe(true)
  })

  test.each([
    ["a public listing", { visibility: "public" }],
    ["a readable description", { description: "production credentials" }],
    ["a readable file", { files: [{ name: "prod.env", language: "text", content: secret }] }],
    [
      "an envelope under a readable file name",
      { files: [{ name: "prod.env", language: "text", content: "" }] },
    ],
    ["a malformed key id", { encryption: { keyId: "short" } }],
  ] as const)("rejects %s", async (_name, overrides) => {
    const { input } = await encryptedInput()
    const changed = { ...input, ...overrides } as PasteInput
    // The file-name case keeps the real envelope, so only the name is wrong.
    if (changed.files[0]?.content === "") {
      changed.files = [{ ...changed.files[0], content: input.files[0]?.content ?? "" }]
    }
    expect(pasteSchema.safeParse(changed).success).toBe(false)
  })

  test("rejects a readable file added next to the envelope", async () => {
    const { input } = await encryptedInput()
    input.files.push({ name: "prod.env", language: "text", content: secret })
    expect(pasteSchema.safeParse(input).success).toBe(false)
  })
})

test("product analytics drop the key from every URL", () => {
  const key = generateKey()
  for (const url of [
    `https://sniptide.com/abc123#key=${key}`,
    `https://app.sniptide.com/pastes/abc123#key=${key}`,
    `/abc123#key=${key}`,
  ]) {
    expect(scrubUrl(url)).not.toContain(key)
    expect(scrubUrl(url)).not.toContain("#")
  }
})

const describeDb = hasDatabase ? describe : describe.skip
describeDb("an encrypted paste on the server", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  async function create(overrides: Partial<PasteInput> = {}) {
    const { key, input } = await encryptedInput(overrides)
    const saved = await savePaste(input)
    if (!saved.ok) throw new Error(saved.error)
    return { key, input, slug: saved.slug }
  }

  test("is stored as ciphertext, snapshot included, and still decrypts with its key", async () => {
    const { key, input, slug } = await create()
    const row = await pasteRow(slug)
    expect(row?.encryptionKeyId).toBe(input.encryption?.keyId ?? "")
    expect(row?.description).toBe("")

    const files = await getDb().select().from(pasteFile)
    const revisions = await getDb().select().from(pasteRevision)
    const stored = JSON.stringify({ row, files, revisions })
    for (const leak of [secret, "prod.env", "production credentials", key]) {
      expect(stored).not.toContain(leak)
    }
    expect(files).toHaveLength(1)
    expect(await decryptPayload(files[0]?.content ?? "", key)).toEqual(payload)
  })

  test("the share page gets the envelope and the key id, and nothing else", async () => {
    const { key, input, slug } = await create()
    signInAs(null)
    const read = await readSharedPaste(slug)
    if (read.status !== "ok") throw new Error(read.status)
    expect(read.paste.encryptionKeyId).toBe(input.encryption?.keyId ?? "")
    expect(read.paste.files).toHaveLength(1)
    expect(JSON.stringify(read)).not.toContain(secret)
    expect(await decryptPayload(read.paste.files[0]?.content ?? "", key)).toEqual(payload)
  })

  test("content can't be replaced, autosaved or restored", async () => {
    const { input, slug } = await create()
    const before = (await getPaste(slug))?.files[0]?.content
    const plain: PasteInput = {
      ...input,
      encryption: null,
      files: [{ name: "a.txt", language: "text", content: "overwritten" }],
    }
    expect((await savePaste(plain, slug)).ok).toBe(false)
    expect((await savePaste(input, slug)).ok).toBe(false)
    const version = (await getPaste(slug))?.version ?? 0
    expect((await autosavePaste(slug, plain, version)).ok).toBe(false)
    const [revision] = await getDb().select().from(pasteRevision)
    expect((await restoreRevision(slug, revision?.id ?? 0)).ok).toBe(false)
    expect((await getPaste(slug))?.files[0]?.content).toBe(before ?? "")
    expect(await getDb().select().from(pasteRevision)).toHaveLength(1)
  })

  test("never becomes public, alone or in a bulk change", async () => {
    const { slug } = await create()
    await updateSharing(slug, { visibility: "public" })
    expect((await pasteRow(slug))?.visibility).toBe("unlisted")
    await setPastesVisibility([slug], "public")
    expect((await pasteRow(slug))?.visibility).toBe("unlisted")
    await updateSharing(slug, { visibility: "private", burnAfterRead: true })
    const row = await pasteRow(slug)
    expect(row?.visibility).toBe("private")
    expect(row?.burnAfterRead).toBe(true)
  })

  test("has no raw file, Markdown copy, embed, link preview, card preview or webhook link", async () => {
    const { slug } = await create()
    expect((await raw(new Request(`https://example.test/${slug}/raw`), context(slug))).status).toBe(
      403,
    )
    expect(
      (await preview(new Request(`https://example.test/${slug}/preview`), context(slug))).status,
    ).toBe(404)
    expect(await readEmbedPaste(slug)).toBeNull()
    expect(await readPublicPreview(slug)).toBeNull()
    expect(await readWebhookPaste(slug)).toBeNull()
    const { pastes } = await listPastePage({ mode: "mine" }, parsePasteListQuery({}))
    expect(pastes.map((paste) => paste.slug)).toEqual([slug])
    expect(await cardPreviews(pastes)).toEqual({})
    const copy = await markdown(new Request(`https://example.test/${slug}`), {
      params: Promise.resolve({ path: [slug] }),
    })
    const text = await copy.text()
    expect(text).toContain("end-to-end encrypted")
    expect(text).not.toContain("sniptide.e2e.v1")
    signInAs(null)
    expect((await raw(new Request(`https://example.test/${slug}/raw`), context(slug))).status).toBe(
      403,
    )
  })

  test("is invisible to the token API, so no client is handed ciphertext as code", async () => {
    const { slug } = await create()
    const id = (await pasteRow(slug))?.id ?? ""
    for (const key of [slug, id]) {
      expect(await getCapture("owner", key)).toBeNull()
      await expect(
        updateCapture("owner", key, {
          title: "Taken over",
          files: [{ name: "a.txt", content: "overwritten" }],
        }),
      ).rejects.toThrow("No paste")
      await expect(updateSettings("owner", key, { visibility: "public" })).rejects.toThrow(
        "No paste",
      )
      await expect(trashCapture("owner", key)).rejects.toThrow("No paste")
    }
    const listed = await listCaptures("owner", listQuerySchema.parse({}))
    expect(listed.pastes).toEqual([])
    // Base64 ciphertext must not turn up as a content match either.
    const searched = await listCaptures("owner", listQuerySchema.parse({ q: "sniptide" }))
    expect(searched.pastes).toEqual([])
    expect(await collectionCaptures("owner", "missing", null)).toBeNull()
    const row = await pasteRow(slug)
    expect(row?.deletedAt).toBeNull()
    expect(row?.visibility).toBe("unlisted")
  })

  test("a one-time read names the key before the reveal and hands over ciphertext", async () => {
    const { key, input, slug } = await create({ burnAfterRead: true })
    signInAs(null)
    expect(await readSharedPaste(slug)).toEqual({
      status: "sealed",
      owned: false,
      signedIn: false,
      encryptionKeyId: input.encryption?.keyId ?? "",
    })
    expect((await pasteRow(slug))?.deletedAt).toBeNull()

    const response = await reveal(
      new Request(`https://example.test/${slug}/reveal`, { method: "POST" }),
      context(slug),
    )
    const body = await response.json()
    expect(body.burned).toBe(true)
    expect(body.encryptionKeyId).toBe(input.encryption?.keyId ?? "")
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(await decryptPayload(body.files[0].content, key)).toEqual(payload)
    expect((await revealSharedPaste(slug)).status).toBe("missing")
  })
})
