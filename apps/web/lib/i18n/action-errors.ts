import "server-only"

import { cookies, headers } from "next/headers"
import { createTranslator } from "next-intl"
import de from "@/messages/de/errors.json"
import en from "@/messages/en/errors.json"
import es from "@/messages/es/errors.json"
import ja from "@/messages/ja/errors.json"
import zh from "@/messages/zh/errors.json"
import { type Locale, localeCookie, resolveLocale } from "./config"

type ErrorKey = keyof typeof en.Errors

const catalogs = { en, de, es, zh, ja } satisfies Record<Locale, typeof en>

function isErrorKey(key: string): key is ErrorKey {
  return Object.hasOwn(en.Errors, key)
}

export async function actionError(key: ErrorKey, values?: Record<string, string | number>) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()])
  const locale = resolveLocale(
    cookieStore.get(localeCookie)?.value,
    requestHeaders.get("accept-language"),
  )
  const translate = createTranslator({ locale, messages: catalogs[locale], namespace: "Errors" })
  return translate(key, values)
}

const templates: [RegExp, (match: RegExpMatchArray) => Promise<string>][] = [
  [
    /^You're doing that too often\. Try again in (\d+) minutes?\.$/,
    (match) => actionError("rateLimit", { minutes: Number(match[1]) }),
  ],
  [
    /^Pastes are limited to (.+)\.$/,
    (match) => actionError("pasteSize", { limit: match[1] ?? "" }),
  ],
  [
    /^(.+) is taken or not allowed\.$/,
    (match) => actionError("slugTaken", { link: match[1] ?? "" }),
  ],
  [/^@(.+) is taken\.$/, (match) => actionError("usernameTaken", { username: match[1] ?? "" })],
  [
    /^Names are limited to (\d+) characters\.$/,
    (match) => actionError("collectionNameLength", { max: Number(match[1]) }),
  ],
  [
    /^You can have up to (\d+) collections\.$/,
    (match) => actionError("collectionLimit", { max: Number(match[1]) }),
  ],
  [
    /^You can have up to (\d+) folders\.$/,
    (match) => actionError("folderLimit", { max: Number(match[1]) }),
  ],
  [
    /^Folders can be nested (\d+) levels deep\.$/,
    (match) => actionError("folderDepth", { max: Number(match[1]) }),
  ],
  [
    /^Move up to (\d+) pastes at once\.$/,
    (match) => actionError("movePastesLimit", { max: Number(match[1]) }),
  ],
  [
    /^You can have up to (\d+) tokens\. Revoke one you no longer use\.$/,
    (match) => actionError("tokenLimit", { max: Number(match[1]) }),
  ],
  [
    /^(.+) couldn't be read from GitHub\.$/s,
    (match) => actionError("gistFileUnreadable", { name: match[1] ?? "" }),
  ],
  [
    /^Name is over (\d+) characters\.$/,
    (match) => actionError("fileNameLength", { max: Number(match[1]) }),
  ],
  [/^Over the (.+) limit\.$/, (match) => actionError("fileSize", { limit: match[1] ?? "" })],
  [
    /^Too big: expected string to have <=(\d+) characters$/,
    (match) => actionError("validationTooLong", { max: Number(match[1]) }),
  ],
]

export async function translateActionError(message: string): Promise<string> {
  for (const key in en.Errors) {
    if (isErrorKey(key) && en.Errors[key] === message) return actionError(key)
  }
  for (const [pattern, translate] of templates) {
    const match = message.match(pattern)
    if (match) return translate(match)
  }
  const skippedFile = message.match(
    /^(.*): (Name is over \d+ characters\.|Over the .+ limit\.|Couldn't be read\.)$/s,
  )
  if (skippedFile) {
    return `${skippedFile[1]}: ${await translateActionError(skippedFile[2] ?? "")}`
  }
  return actionError("invalid")
}
