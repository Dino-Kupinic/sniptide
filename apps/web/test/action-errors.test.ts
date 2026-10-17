import { afterEach, describe, expect, test } from "bun:test"
import { createTranslator } from "next-intl"
import { createApiToken } from "@/lib/api/token-actions"
import { createCollection } from "@/lib/collections/actions"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import { localeCookie, locales } from "@/lib/i18n/config"
import { findPerson, previewGist, savePaste } from "@/lib/pastes/actions"
import { shareToWebhook } from "@/lib/pastes/webhook-actions"
import { updateAvatar, updateProfile } from "@/lib/settings-actions"
import de from "@/messages/de/errors.json"
import en from "@/messages/en/errors.json"
import es from "@/messages/es/errors.json"
import ja from "@/messages/ja/errors.json"
import zh from "@/messages/zh/errors.json"
import { request } from "./request"

const catalogs = { en, de, es, zh, ja }

function isErrorKey(key: string): key is keyof typeof en.Errors {
  return Object.hasOwn(en.Errors, key)
}

afterEach(() => {
  request.viewer = null
  request.cookies.clear()
  request.headers = new Headers()
})

describe("localized action errors", () => {
  test("uses a valid language cookie before the browser language", async () => {
    request.cookies.set(localeCookie, "de")
    request.headers.set("accept-language", "ja")
    expect(await actionError("pasteMissing")).toBe("Dieser Paste existiert nicht mehr.")
  })

  test("uses browser language when the cookie is invalid and English as a fallback", async () => {
    request.cookies.set(localeCookie, "../../invalid")
    request.headers.set("accept-language", "es-MX, en;q=0.5")
    expect(await actionError("pasteMissing")).toBe("Ese paste ya no existe.")
    request.headers.set("accept-language", "unknown")
    expect(await actionError("pasteMissing")).toBe("That paste no longer exists.")
  })

  test("keeps known English messages and interpolated values unchanged", async () => {
    const messages = [
      "Give the paste a title.",
      "You're doing that too often. Try again in 1 minute.",
      "You're doing that too often. Try again in 12 minutes.",
      "Pastes are limited to 1 MB.",
      "localhost:3000/my-slug is taken or not allowed.",
      "@my-user is taken.",
      "Names are limited to 40 characters.",
      "You can have up to 50 collections.",
      "You can have up to 25 tokens. Revoke one you no longer use.",
      "Too big: expected string to have <=120 characters",
      "log.txt: Couldn't be read.",
      "huge.json: Over the 1 MB limit.",
      "long-name.txt: Name is over 120 characters.",
      "log.txt couldn't be read from GitHub.",
      "You've reached your storage limit. Permanently delete some pastes or reduce their size.",
    ]
    for (const message of messages) expect(await translateActionError(message)).toBe(message)
  })

  test("translates dynamic limits, filenames and usernames", async () => {
    request.cookies.set(localeCookie, "de")
    expect(await translateActionError("You're doing that too often. Try again in 1 minute.")).toBe(
      "Du führst diese Aktion zu oft aus. Versuche es in 1 Minute erneut.",
    )
    expect(await translateActionError("You're doing that too often. Try again in 3 minutes.")).toBe(
      "Du führst diese Aktion zu oft aus. Versuche es in 3 Minuten erneut.",
    )
    expect(await translateActionError("@alice is taken.")).toBe("@alice ist bereits vergeben.")
    expect(await translateActionError("log.txt: Couldn't be read.")).toBe(
      "log.txt: Konnte nicht gelesen werden.",
    )
    request.cookies.set(localeCookie, "zh")
    expect(await translateActionError("Pastes are limited to 1 MB.")).toBe(
      "代码片段的大小上限为 1 MB。",
    )
    request.cookies.set(localeCookie, "ja")
    expect(await translateActionError("That collection no longer exists.")).toBe(
      "このコレクションはもう存在しません。",
    )
  })

  test("does not return unknown provider messages or raw validation failures", async () => {
    request.cookies.set(localeCookie, "es")
    expect(await translateActionError("database password=secret connection failed")).toBe(
      "Revisa los datos e inténtalo de nuevo.",
    )
    expect(await translateActionError("Invalid input: expected string, received null")).toBe(
      "Revisa los datos e inténtalo de nuevo.",
    )
  })

  test("returns translated validation and authentication errors through server actions", async () => {
    request.cookies.set(localeCookie, "de")
    request.viewer = "owner"
    expect(await createCollection("")).toEqual({
      ok: false,
      error: "Gib der Sammlung einen Namen.",
    })
    expect(
      await savePaste({
        title: "",
        description: "",
        files: [{ name: "a.txt", content: "code" }],
        visibility: "unlisted",
        expiry: "never",
        slug: "",
        collection: null,
        password: null,
        burnAfterRead: false,
      }),
    ).toEqual({ ok: false, error: "Gib dem Paste einen Titel." })
    expect(await findPerson("")).toEqual({
      ok: false,
      error: "Gib eine E-Mail-Adresse oder einen Benutzernamen ein.",
    })
    expect(await previewGist("invalid")).toEqual({
      ok: false,
      error: "Füge einen Gist-Link wie gist.github.com/you/1a2b3c… ein.",
    })
    expect(await updateAvatar("invalid")).toEqual({
      ok: false,
      error: "Lade ein Bild im Format JPEG, PNG oder WebP hoch.",
    })
    request.viewer = null
    expect(await updateProfile({ name: "Alice", username: "alice" })).toEqual({
      ok: false,
      error: "Melde dich erneut an, um dein Profil zu ändern.",
    })
    expect(await createApiToken({ name: "test", write: false, expiry: "30d" })).toEqual({
      ok: false,
      error: "Melde dich erneut an, um einen Token zu erstellen.",
    })
    expect(await shareToWebhook("a-paste", "slack")).toEqual({
      ok: false,
      error: "Melde dich an, um einen Paste zu teilen.",
    })
  })

  test("every locale has every error and formats every ICU message", () => {
    const expectedKeys = Object.keys(en.Errors).sort()
    for (const locale of locales) {
      const catalog = catalogs[locale]
      expect(Object.keys(catalog.Errors).sort()).toEqual(expectedKeys)
      const failures: unknown[] = []
      const translate = createTranslator({
        locale,
        messages: catalog,
        namespace: "Errors",
        onError: (error) => failures.push(error),
      })
      for (const key in catalog.Errors) {
        if (!isErrorKey(key)) continue
        const formatted = translate(key, {
          limit: "1 MB",
          minutes: 2,
          max: 50,
          name: "a.txt",
          link: "example.com/link",
          username: "alice",
        })
        expect(formatted.length).toBeGreaterThan(0)
        expect(formatted).not.toContain("Errors.")
      }
      expect(failures).toEqual([])
    }
  })
})
