"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth"
import { actionError } from "@/lib/i18n/action-errors"
import { changePreferences } from "@/lib/preference-store"
import { cleanLayout, WIDGETS } from "./widgets"

type Result = { ok: true } | { ok: false; error: string }

// Saves the signed-in account's dashboard layout. The page reloads its data afterwards, so a
// widget that was just added arrives with its rows.
export async function saveDashboardLayout(layout: unknown): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  if (!Array.isArray(layout) || layout.length > WIDGETS.length)
    return { ok: false, error: await actionError("saveFailed") }
  const dashboard = cleanLayout(layout)
  if (dashboard.length !== layout.length)
    return { ok: false, error: await actionError("saveFailed") }
  const saved = await changePreferences(session.user.id, (current) => ({ ...current, dashboard }))
  if (!saved) return { ok: false, error: await actionError("signInSettings") }
  revalidatePath("/dashboard")
  return { ok: true }
}
