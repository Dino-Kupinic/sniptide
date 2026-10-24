import { afterEach, describe, expect, test } from "bun:test"
import { GET } from "@/app/api/live/route"
import { createCapture } from "@/lib/api/pastes"
import { announceChange, subscribeToChanges } from "@/lib/live/changes"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

// Open tabs follow an account's changes through Postgres LISTEN/NOTIFY and /api/live, whichever
// way the write came in.

const describeDb = hasDatabase ? describe : describe.skip

// Gives Postgres time to deliver a notification.
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 150))
}

describeDb("live changes", () => {
  afterEach(() => signInAs(null))

  test("reach the account's subscribers and nobody else's", async () => {
    let ada = 0
    let bob = 0
    const stopAda = await subscribeToChanges("ada", () => ada++)
    const stopBob = await subscribeToChanges("bob", () => bob++)

    await announceChange("ada")
    await settle()
    expect(ada).toBe(1)
    expect(bob).toBe(0)

    stopAda()
    await announceChange("ada")
    await settle()
    expect(ada).toBe(1)
    stopBob()
  })

  test("are announced when a paste comes in through the API or MCP", async () => {
    await resetDatabase()
    await seedUser("ada")
    let changes = 0
    const stop = await subscribeToChanges("ada", () => changes++)

    await createCapture("ada", { title: "From an agent", files: [{ name: "a.ts", content: "1" }] })
    await settle()
    expect(changes).toBe(1)
    stop()
  })

  test("stream to the signed-in account as server-sent events", async () => {
    signInAs("ada")
    const abort = new AbortController()
    const response = await GET(new Request("http://localhost/api/live", { signal: abort.signal }))
    expect(response.headers.get("content-type")).toStartWith("text/event-stream")

    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    expect(decoder.decode((await reader.read()).value)).toBe("retry: 5000\n\n")

    await announceChange("ada")
    expect(decoder.decode((await reader.read()).value)).toBe("event: change\ndata: {}\n\n")
    abort.abort()
  })

  test("need a session", async () => {
    signInAs(null)
    const response = await GET(new Request("http://localhost/api/live"))
    expect(response.status).toBe(401)
  })
})
