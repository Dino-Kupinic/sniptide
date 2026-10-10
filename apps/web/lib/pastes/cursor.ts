import "server-only"
import { createHash } from "node:crypto"
import type { PasteListQuery } from "./list-query"

export interface ListCursor {
  id: string
  value: string | number | null
  direction: "after" | "before"
  page: number
  key: string
}
export function cursorKey(viewer: string, scope: object, query: PasteListQuery) {
  return createHash("sha256")
    .update(JSON.stringify([viewer, scope, { ...query, page: undefined, cursor: undefined }]))
    .digest("hex")
    .slice(0, 24)
}
export function encodeCursor(cursor: ListCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}
export function decodeCursor(
  token: string | undefined,
  key: string,
  page: number,
): ListCursor | null {
  if (!token || token.length > 2048) return null
  try {
    const cursor: ListCursor = JSON.parse(Buffer.from(token, "base64url").toString("utf8"))
    if (
      cursor.key !== key ||
      cursor.page !== page ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id) ||
      !["after", "before"].includes(cursor.direction) ||
      !(
        cursor.value === null ||
        (typeof cursor.value === "string" && cursor.value.length <= 120) ||
        (typeof cursor.value === "number" && Number.isSafeInteger(cursor.value))
      )
    )
      return null
    return cursor
  } catch {
    return null
  }
}
