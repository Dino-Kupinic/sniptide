"use server"

import { onboarding } from "@workspace/db/schema"
import { sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { actionError } from "@/lib/i18n/action-errors"
import { isSignupSourceAnswer, isUseCase } from "@/lib/onboarding"

type Result = { ok: true } | { ok: false; error: string }

// Stores where the account heard about Sniptide, or "skipped". The first answer wins, so going
// back in the wizard or a second tab never rewrites it. Writing the row also ends the redirect
// to the wizard.
export async function saveSignupSource(answer: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  if (!isSignupSourceAnswer(answer)) return { ok: false, error: await actionError("saveFailed") }

  try {
    await getDb()
      .insert(onboarding)
      .values({ userId: session.user.id, source: answer })
      .onConflictDoNothing()
  } catch {
    return { ok: false, error: await actionError("saveFailed") }
  }
  return { ok: true }
}

// Stores what the account wants to use Sniptide for. Unlike the source, a later answer replaces
// an earlier one, since going back to change it is a correction.
export async function saveUseCase(answer: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  if (!isUseCase(answer)) return { ok: false, error: await actionError("saveFailed") }

  try {
    await getDb()
      .insert(onboarding)
      .values({ userId: session.user.id, source: "skipped", useCase: answer })
      .onConflictDoUpdate({ target: onboarding.userId, set: { useCase: sql`excluded.use_case` } })
  } catch {
    return { ok: false, error: await actionError("saveFailed") }
  }
  return { ok: true }
}
