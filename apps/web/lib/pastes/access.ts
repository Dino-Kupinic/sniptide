import "server-only"

import { cookies } from "next/headers"
import { getSession } from "@/lib/auth"
import { isExpired } from "./store"
import type { Paste } from "./types"
import { unlockCookieName, unlockToken } from "./unlock"

export type Access =
  | { status: "ok"; signedIn: boolean; owned: boolean }
  | { status: "locked" }
  | { status: "missing" }

// Who may read a paste on its public URL (page and raw). Its owner always can; everyone else
// needs a public or unlisted paste and, if set, the password.
export async function checkAccess(paste: Paste | null): Promise<Access> {
  if (!paste || isExpired(paste)) return { status: "missing" }

  const signedIn = Boolean(await getSession())
  if (!paste.owner) return { status: "ok", signedIn, owned: true }
  if (paste.visibility === "private") return { status: "missing" }

  if (paste.password) {
    const cookie = (await cookies()).get(unlockCookieName(paste.slug))?.value
    if (cookie !== (await unlockToken(paste.slug, paste.password))) return { status: "locked" }
  }

  return { status: "ok", signedIn, owned: false }
}
