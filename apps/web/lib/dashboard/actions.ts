"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth"
import { actionError } from "@/lib/i18n/action-errors"
import { changePreferences } from "@/lib/preference-store"
import { cleanLayout, cleanWidgetSizes, WIDGETS } from "./widgets"

type Result = { ok: true } | { ok: false; error: string }

// Saves the signed-in account's dashboard layout. The page reloads its data afterwards, so a
// widget that was just added arrives with its rows.
export async function saveDashboardLayout(layout: unknown, sizes?: unknown): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  if (!Array.isArray(layout) || layout.length > WIDGETS.length)
    return { ok: false, error: await actionError("saveFailed") }
  const dashboard = cleanLayout(layout)
  if (dashboard.length !== layout.length)
    return { ok: false, error: await actionError("saveFailed") }
  const dashboardSizes = sizes === undefined ? undefined : cleanWidgetSizes(sizes)
  if (
    sizes !== undefined &&
    (!sizes ||
      typeof sizes !== "object" ||
      Array.isArray(sizes) ||
      Object.keys(dashboardSizes ?? {}).length !== Object.keys(sizes).length)
  )
    return { ok: false, error: await actionError("saveFailed") }
  const saved = await changePreferences(session.user.id, (current) => ({
    ...current,
    dashboard,
    ...(dashboardSizes === undefined ? {} : { dashboardSizes }),
  }))
  if (!saved) return { ok: false, error: await actionError("signInSettings") }
  revalidatePath("/dashboard")
  return { ok: true }
}
