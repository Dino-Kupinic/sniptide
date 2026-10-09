import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { getOwnPaste, getUnlockHash, readSharedPaste } from "@/lib/pastes/store"
import {
  hasDatabase,
  marker,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  unlock,
} from "./harness"

// Who may read which paste, on every way of reading one. The audit found content in responses
// that looked denied, so these check what comes back, not just whether it is a 404.

const describeDb = hasDatabase ? describe : describe.skip

describeDb("read access", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    await seedPaste({ slug: "pub", owner: "owner", visibility: "public" })
    await seedPaste({ slug: "unl", owner: "owner", visibility: "unlisted" })
    await seedPaste({ slug: "priv", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "pw", owner: "owner", visibility: "unlisted", password: "hunter22" })
    await seedPaste({
      slug: "privpw",
      owner: "owner",
      visibility: "private",
      password: "hunter22",
    })
    await seedPaste({
      slug: "old",
      owner: "owner",
      visibility: "public",
      expiresAt: new Date(Date.now() - 1000),
    })
    await seedPaste({
      slug: "bin",
      owner: "owner",
      visibility: "public",
      deletedAt: new Date(),
    })
  })

  const viewers = {
    anonymous: null,
    "another account": "other",
  } as const

  describe("getOwnPaste (the app's detail, edit and duplicate screens)", () => {
    test("returns the owner's own pastes, whatever their visibility or password", async () => {
      signInAs("owner")
      for (const slug of ["pub", "unl", "priv", "pw", "privpw"]) {
        const paste = await getOwnPaste(slug)
        expect(paste?.files[0]?.content).toBe(marker(slug))
        expect(paste?.owner).toBeNull()
      }
    })

    for (const [who, id] of Object.entries(viewers)) {
      test(`returns nothing for ${who}, even for public pastes`, async () => {
        signInAs(id)
        for (const slug of ["pub", "unl", "priv", "pw", "privpw", "old", "bin", "nope"]) {
          expect(await getOwnPaste(slug)).toBeNull()
        }
      })
    }

    test("hides the owner's pastes in the trash", async () => {
      signInAs("owner")
      expect(await getOwnPaste("bin")).toBeNull()
    })
  })

  describe("readSharedPaste (the public link and raw files)", () => {
    for (const [who, id] of Object.entries(viewers)) {
      describe(who, () => {
        beforeEach(() => signInAs(id))

        test("reads public and unlisted pastes", async () => {
          for (const slug of ["pub", "unl"]) {
            const read = await readSharedPaste(slug)
            expect(read.status).toBe("ok")
            if (read.status === "ok") {
              expect(read.paste.files[0]?.content).toBe(marker(slug))
              expect(read.owned).toBe(false)
              expect(read.signedIn).toBe(id !== null)
            }
          }
        })

        test("gets nothing for private, expired, trashed or unknown pastes", async () => {
          for (const slug of ["priv", "privpw", "old", "bin", "nope"]) {
            expect(await readSharedPaste(slug)).toEqual({ status: "missing" })
          }
        })

        test("is locked out of a password paste, without any of its content", async () => {
          const read = await readSharedPaste("pw")
          expect(read).toEqual({ status: "locked" })
          expect(JSON.stringify(read)).not.toContain(marker("pw"))
        })

        test("reads a password paste once its unlock cookie is present", async () => {
          await unlock("pw")
          const read = await readSharedPaste("pw")
          expect(read.status).toBe("ok")
        })

        test("an unlock cookie does not open a private paste", async () => {
          await unlock("privpw")
          expect(await readSharedPaste("privpw")).toEqual({ status: "missing" })
        })
      })
    }

    test("the owner reads their private and password pastes without unlocking", async () => {
      signInAs("owner")
      for (const slug of ["priv", "pw", "privpw", "pub"]) {
        const read = await readSharedPaste(slug)
        expect(read.status).toBe("ok")
        if (read.status === "ok") expect(read.owned).toBe(true)
      }
    })

    test("expired and trashed pastes are gone for the owner's public link too", async () => {
      signInAs("owner")
      expect(await readSharedPaste("old")).toEqual({ status: "missing" })
      expect(await readSharedPaste("bin")).toEqual({ status: "missing" })
    })

    test("a cookie minted for another password paste does not unlock this one", async () => {
      signInAs("other")
      await seedPaste({ slug: "pw2", owner: "owner", password: "another-one" })
      await unlock("pw")
      const { request } = await import("./request")
      request.cookies.set(
        "sniptide_unlock_pw2",
        request.cookies.get("sniptide_unlock_pw") as string,
      )
      expect(await readSharedPaste("pw2")).toEqual({ status: "locked" })
    })
  })

  describe("getUnlockHash (the unlock route)", () => {
    test("only offers a hash for password pastes someone could open", async () => {
      expect(await getUnlockHash("pw")).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
      for (const slug of ["pub", "priv", "privpw", "old", "bin", "nope"]) {
        expect(await getUnlockHash(slug)).toBeNull()
      }
    })
  })
})
