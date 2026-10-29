"use server"

import { signupSource } from "@workspace/db/schema"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { actionError } from "@/lib/i18n/action-errors"
import { isSignupSourceAnswer } from "@/lib/signup-source"

type Result = { ok: true } | { ok: false; error: string }

// Stores the answer once; a later answer never replaces the first.
export async function answerSignupSource(answer: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  if (!isSignupSourceAnswer(answer)) return { ok: false, error: await actionError("saveFailed") }

  try {
    await getDb()
      .insert(signupSource)
      .values({ userId: session.user.id, source: answer })
      .onConflictDoNothing()
  } catch {
    return { ok: false, error: await actionError("saveFailed") }
  }
  return { ok: true }
}
