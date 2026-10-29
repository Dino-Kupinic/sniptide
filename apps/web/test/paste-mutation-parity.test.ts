import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { paste, pasteRevision } from "@workspace/db/schema"
import { desc, eq } from "drizzle-orm"
import { createCapture, getCapture, updateCapture } from "@/lib/api/pastes"
import { getDb } from "@/lib/db"
import { createPasteRecord } from "@/lib/pastes/mutations"
import { createPaste, getPaste, sharePaste, updatePaste } from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const originalLimit = process.env.ACCOUNT_STORAGE_BYTES
const input = (overrides: Partial<PasteInput> = {}): PasteInput => ({
  title: "Browser paste",
  description: "Description",
  files: [{ name: "a.ts", content: "const a = 1", language: "text" }],
  visibility: "private",
  expiry: "never",
  slug: "",
  collection: null,
  password: null,
  burnAfterRead: false,
  ...overrides,
})

describeDb("browser and token mutation ownership", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("mutation-owner")
    await seedUser("mutation-editor")
    signInAs("mutation-owner")
  })
  afterEach(() => {
    if (originalLimit === undefined) delete process.env.ACCOUNT_STORAGE_BYTES
    else process.env.ACCOUNT_STORAGE_BYTES = originalLimit
  })
  afterAll(resetDatabase)

  test("API capture provenance survives a browser metadata edit and another token edit", async () => {
    const source = {
      repository: "https://github.com/example/repo",
      commit: "abcdef0",
      dirty: false,
    }
    const captured = await createCapture("mutation-owner", {
      title: "Captured",
      description: "Original description",
      tags: ["typescript"],
      source,
      files: [{ name: "a.ts", content: "const a = 1", lines: { start: 10, end: 10 } }],
    })
    const browser = await getPaste(captured.slug)
    expect(browser).not.toBeNull()
    if (!browser) throw new Error("Created paste is missing")
    await updatePaste(captured.slug, input({ title: "Renamed", files: browser.files }), "Edited")
    const roundtrip = await getCapture("mutation-owner", captured.id)
    expect(roundtrip?.tags).toEqual(["typescript"])
    expect(roundtrip?.source).toEqual(source)
    expect(roundtrip?.files[0]?.lines).toEqual({ start: 10, end: 10 })
    const [revision] = await getDb()
      .select()
      .from(pasteRevision)
      .where(eq(pasteRevision.pasteId, captured.id))
      .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
    expect(revision?.snapshot?.files[0]?.startLine).toBe(10)
    const updated = await updateCapture("mutation-owner", captured.id, {
      title: "Token edit",
      files: [{ name: "b.ts", content: "const b = 2" }],
    })
    expect(updated.tags).toEqual(["typescript"])
    expect(updated.source).toEqual(source)
    expect(updated.description).toBe("Description")
  })

  test("a token edit invalidates a stale browser version without a partial save", async () => {
    const saved = await createPaste(input())
    const browser = await getPaste(saved.slug)
    if (!browser) throw new Error("Created paste is missing")
    const updated = await updateCapture("mutation-owner", saved.slug, {
      title: "Changed by token",
      files: [{ name: "a.ts", content: "const a = 2" }],
    })
    const result = await updatePaste(saved.slug, input({ title: "Stale" }), "Edited", {
      expectedVersion: browser.version,
    })
    expect(result).toMatchObject({ conflict: true, slug: saved.slug })
    const current = await getCapture("mutation-owner", saved.slug)
    expect(current?.title).toBe(updated.title)
    expect(current?.files).toEqual(updated.files)
    const revisions = await getDb()
      .select()
      .from(pasteRevision)
      .where(eq(pasteRevision.pasteId, updated.id))
      .orderBy(pasteRevision.createdAt, pasteRevision.id)
    expect(revisions.map((row) => row.message)).toEqual(["Created", "Edited via API"])
  })

  test("browser collaborators can edit content but tokens remain owner-only", async () => {
    const captured = await createCapture("mutation-owner", {
      title: "Shared",
      files: [{ name: "a.ts", content: "const a = 1" }],
    })
    await sharePaste(captured.slug, "mutation-editor", "edit")
    signInAs("mutation-editor")
    expect(
      await updatePaste(
        captured.slug,
        input({ title: "Collaborator", visibility: "public" }),
        "Edited",
      ),
    ).not.toBeNull()
    const updated = await getCapture("mutation-owner", captured.id)
    expect(updated?.title).toBe("Collaborator")
    expect(updated?.visibility).toBe("private")
    await expect(
      updateCapture("mutation-editor", captured.id, {
        title: "Unauthorized",
        files: [{ name: "a.ts", content: "forbidden" }],
      }),
    ).rejects.toThrow("No paste with that id")
  })

  test("browser and token creates serialize the same account storage budget", async () => {
    process.env.ACCOUNT_STORAGE_BYTES = "8"
    const results = await Promise.allSettled([
      createPaste(input({ files: [{ name: "a.txt", content: "12345", language: "text" }] })),
      createCapture("mutation-owner", {
        title: "Token",
        files: [{ name: "b.txt", content: "67890" }],
      }),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const rows = await getDb().select().from(paste).where(eq(paste.ownerId, "mutation-owner"))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.bytes).toBe(5)
  })

  test("a caller-owned transaction rolls back the paste, files, and revision together", async () => {
    await expect(
      getDb().transaction(async (tx) => {
        await createPasteRecord(tx, {
          kind: "editor",
          actor: { kind: "session", userId: "mutation-owner" },
          input: input(),
          passwordHash: null,
          invites: [],
        })
        throw new Error("Abort transaction")
      }),
    ).rejects.toThrow("Abort transaction")
    expect(
      await getDb().select().from(paste).where(eq(paste.ownerId, "mutation-owner")),
    ).toHaveLength(0)
    expect(await getDb().select().from(pasteRevision)).toHaveLength(0)
  })
})
