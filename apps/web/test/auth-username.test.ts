import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createAuth } from "@workspace/auth"
import { toUsername } from "@workspace/auth/username"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase } from "./harness"

// GitHub and Google sign-ups have no username field to fill in, so the account gets one picked
// for it. Without one the public profile at /@username has no address.

const describeDb = hasDatabase ? describe : describe.skip

describe("toUsername", () => {
  test("turns provider names into usernames", () => {
    expect(toUsername("Dino-Kupinic")).toBe("dino-kupinic")
    expect(toUsername("Dino Kupinic")).toBe("dino-kupinic")
    expect(toUsername("  José  Núñez ")).toBe("jose-nunez")
    expect(toUsername("dino.kupinic__")).toBe("dino-kupinic")
    expect(toUsername("a".repeat(40))).toBe("a".repeat(30))
  })

  test("returns null when nothing usable is left", () => {
    expect(toUsername("李小龍")).toBeNull()
    expect(toUsername("Al")).toBeNull()
    expect(toUsername("")).toBeNull()
    expect(toUsername(undefined)).toBeNull()
  })
})

describeDb("usernames for accounts created without one", () => {
  afterAll(resetDatabase)
  beforeEach(resetDatabase)

  const auth = createAuth({
    db: getDb(),
    secret: "test-secret-that-is-long-enough-for-better-auth",
    baseURL: "http://localhost:3000",
    github: { clientId: "id", clientSecret: "secret" },
  })

  // The same call GitHub and Google sign-ups make, with the fields the provider handed over.
  async function create(email: string, name: string, username?: string) {
    const context = await auth.$context
    return context.internalAdapter.createUser(
      { email, name, emailVerified: true, username },
      { method: "oauth", oauth: { providerId: "google" } },
    )
  }

  function githubUsername(profile: { login: string; name: string | null }) {
    const map = auth.options.socialProviders.github?.mapProfileToUser
    if (!map) throw new Error("GitHub sign-in maps no profile fields")
    // biome-ignore lint/suspicious/noExplicitAny: the test passes only the fields the mapper reads.
    return Promise.resolve(map(profile as any)).then((user) => user.username)
  }

  test("a Google sign-up gets a username from its display name", async () => {
    const user = await create("dino@example.com", "Dino Kupinic")
    expect(user.username).toBe("dino-kupinic")
    expect(user.displayUsername).toBe("dino-kupinic")
  })

  test("a taken name gets the lowest free number", async () => {
    await create("one@example.com", "Dino Kupinic")
    await create("two@example.com", "Dino Kupinic")
    expect((await create("three@example.com", "dino kupinic")).username).toBe("dino-kupinic-3")
  })

  test("a name without usable letters falls back to user", async () => {
    expect((await create("li@example.com", "李小龍")).username).toBe("user")
    expect((await create("li2@example.com", "李")).username).toBe("user-2")
  })

  test("a GitHub sign-up keeps its login, and falls back to the name once the login is taken", async () => {
    const login = await githubUsername({ login: "Dino-Kupinic", name: "Dino K" })
    expect(login).toBe("dino-kupinic")
    expect((await create("dino@example.com", "Dino K", login)).username).toBe("dino-kupinic")
    expect(await githubUsername({ login: "dino-kupinic", name: "Dino K" })).toBe("dino-k")
  })

  test("a username given at sign-up stays as given", async () => {
    expect((await create("ada@example.com", "Ada Lovelace", "ada")).username).toBe("ada")
  })
})
