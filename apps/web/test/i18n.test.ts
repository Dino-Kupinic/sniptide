import { describe, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser"
import { createTranslator, type TranslationValues } from "next-intl"
import { POST as changeLocale } from "@/app/api/locale/route"
import { formatBytes, formatNumber, timeAgo, timeUntil } from "@/lib/format"
import { setLocale } from "@/lib/i18n/actions"
import { localeCookie, locales, resolveLocale } from "@/lib/i18n/config"
import { describeNotification } from "@/lib/notifications/describe"
import { HOUR } from "@/lib/time"
import { request } from "./request"

describe("locale selection", () => {
  test("a saved choice wins over the browser preference", () => {
    expect(resolveLocale("ja", "de-DE,de;q=0.9")).toBe("ja")
  })

  test("regional browser languages resolve in quality order", () => {
    expect(resolveLocale(undefined, "fr-FR,de-AT;q=0.8,en;q=0.5")).toBe("de")
    expect(resolveLocale(undefined, "en;q=0.5,es-MX;q=0.9")).toBe("es")
    expect(resolveLocale(undefined, "zh-CN,ja;q=0.8")).toBe("zh")
    expect(resolveLocale(undefined, "ja-JP")).toBe("ja")
  })

  test("invalid and excluded language preferences fall back safely", () => {
    expect(resolveLocale("../../en", "de;q=0,es;q=oops,ja;q=2")).toBe("en")
    expect(resolveLocale(undefined, null)).toBe("en")
    expect(resolveLocale(undefined, "fr,*;q=0.5")).toBe("en")
  })

  test("the language action persists only supported locales", async () => {
    request.cookies.clear()
    await setLocale("es")
    expect(request.cookies.get(localeCookie)).toBe("es")
    await expect(setLocale("fr")).rejects.toThrow("Unsupported locale")
    expect(request.cookies.get(localeCookie)).toBe("es")
    request.cookies.clear()
  })

  test("a proxied share page can save a language through the route handler", async () => {
    request.cookies.clear()
    const response = await changeLocale(
      new Request("https://app.example.test/api/locale", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify("de"),
      }),
    )
    expect(response.status).toBe(200)
    expect(request.cookies.get(localeCookie)).toBe("de")
    const invalid = await changeLocale(
      new Request("https://app.example.test/api/locale", {
        method: "POST",
        body: JSON.stringify("fr"),
      }),
    )
    expect(invalid.status).toBe(400)
    expect(request.cookies.get(localeCookie)).toBe("de")
    request.cookies.clear()
  })
})

test("notification sentences use the locale and preserve the paste title", () => {
  expect(
    describeNotification(
      {
        kind: "shared",
        count: null,
        title: "my-config.ts",
        slug: "config",
        expiresAt: null,
        actor: "Alice",
      },
      0,
      "de",
    ),
  ).toEqual({
    title: "Alice hat „my-config.ts“ mit dir geteilt",
    detail: "Öffne es unter Mit mir geteilt",
    href: "/pastes/config",
  })
})

test("numbers, bytes and relative times use the chosen locale", () => {
  expect(formatNumber(12345, "de")).toBe("12.345")
  expect(formatBytes(1536, "de")).toBe("1,5 KB")
  expect(timeAgo(0, 2 * HOUR, "es")).toBe("hace 2 horas")
  expect(timeUntil(2 * HOUR, 0, "ja")).toBe("2 時間後")
})

function flattenMessages(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value }
  if (typeof value !== "object" || value === null) throw new Error(`Invalid message at ${prefix}`)
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, child]) =>
      flattenMessages(child, prefix ? `${prefix}.${key}` : key),
    ),
  )
}

function messageArguments(elements: MessageFormatElement[]): Set<string> {
  const names = new Set<string>()
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue
    if (element.type === TYPE.tag) {
      for (const name of messageArguments(element.children)) names.add(name)
      continue
    }
    names.add(element.value)
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const option of Object.values(element.options)) {
        for (const name of messageArguments(option.value)) names.add(name)
      }
    }
  }
  return names
}

test("all five catalogs have the same messages and valid ICU arguments", async () => {
  const directory = path.join(import.meta.dir, "../messages")
  const files = (await readdir(path.join(directory, "en"))).filter((file) => file.endsWith(".json"))
  expect(files.sort()).toEqual([
    "auth.json",
    "core.json",
    "errors.json",
    "not-found.json",
    "paste.json",
    "settings.json",
    "workspace.json",
  ])

  for (const file of files) {
    const source = flattenMessages(await Bun.file(path.join(directory, "en", file)).json())
    for (const locale of locales) {
      const messages = await Bun.file(path.join(directory, locale, file)).json()
      const flat = flattenMessages(messages)
      expect(Object.keys(flat).sort()).toEqual(Object.keys(source).sort())
      const t = createTranslator({
        locale,
        messages,
        timeZone: "UTC",
        onError(error) {
          throw error
        },
      })
      for (const [key, message] of Object.entries(flat)) {
        expect(message.trim().length).toBeGreaterThan(0)
        const args = [...messageArguments(parse(message))]
        const sourceArgs = [...messageArguments(parse(source[key] ?? ""))]
        expect(args.sort()).toEqual(sourceArgs.sort())
        const values: TranslationValues = Object.fromEntries(args.map((arg) => [arg, 2]))
        const richValues = {
          ...values,
          ...Object.fromEntries(
            [...message.matchAll(/<(\w+)>/g)].map((match) => [
              match[1],
              (chunks: React.ReactNode) => chunks,
            ]),
          ),
        }
        expect(t.rich(key, richValues)).toBeDefined()
      }
    }
  }
})
