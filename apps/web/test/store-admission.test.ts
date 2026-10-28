import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { setStarred, sharePaste } from "@/lib/pastes/store"
import { createRequestAdmission } from "@/lib/request-admission"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs, unlock } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
async function withOneExecution(work: () => Promise<void>) {
  const state = globalThis as typeof globalThis & {
    __sniptideAdmission?: ReturnType<typeof createRequestAdmission>
    __sniptideAdmissionInstalled?: boolean
  }
  const previous = state.__sniptideAdmission
  const installed = state.__sniptideAdmissionInstalled
  state.__sniptideAdmission = createRequestAdmission({
    http: 64,
    probes: 2,
    streams: 128,
    database: 3,
    databaseProbes: 1,
    databaseMaintenance: 1,
    databaseQueue: 0,
  })
  state.__sniptideAdmissionInstalled = true
  try {
    await work()
  } finally {
    state.__sniptideAdmission = previous
    state.__sniptideAdmissionInstalled = installed
  }
}

describeDb("store operations with one admitted database execution", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("reader")
  })
  test("a password-unlocked starred list uses its transaction for candidate reads", async () => {
    await seedPaste({ slug: "locked-star", owner: "owner", password: "secret" })
    signInAs("reader")
    await unlock("locked-star")
    await setStarred("locked-star", true)
    await withOneExecution(async () => {
      const page = await listPastePage({ mode: "starred" }, parsePasteListQuery({}))
      expect(page.pastes.map((p) => p.slug)).toEqual(["locked-star"])
    })
  })
  test("starring an invited private paste revalidates access on the held transaction", async () => {
    await seedPaste({ slug: "invited-star", owner: "owner", visibility: "private" })
    signInAs("owner")
    await sharePaste("invited-star", "reader", "view")
    signInAs("reader")
    await withOneExecution(async () => {
      await setStarred("invited-star", true)
      const page = await listPastePage({ mode: "starred" }, parsePasteListQuery({}))
      expect(page.pastes.map((p) => p.slug)).toEqual(["invited-star"])
    })
  })
})
