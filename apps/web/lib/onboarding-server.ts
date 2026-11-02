import "server-only"

import { onboarding } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { isDemoMode } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { ONBOARDING_WINDOW_DAYS } from "@/lib/onboarding"
import { DAY } from "@/lib/time"

type Account = { id: string; createdAt: Date | string }

// Only recent accounts get the wizard, and never the shared demo account, which many visitors use.
export function canOnboard(user: Account, now = new Date()) {
  if (isDemoMode()) return false
  return now.getTime() - new Date(user.createdAt).getTime() <= ONBOARDING_WINDOW_DAYS * DAY
}

// The account's stored answers, or null before the first step was answered or skipped.
export async function getOnboardingAnswers(userId: string) {
  const [row] = await getDb()
    .select({ source: onboarding.source, useCase: onboarding.useCase })
    .from(onboarding)
    .where(eq(onboarding.userId, userId))
    .limit(1)
  return row ?? null
}

// Whether the dashboard sends the account to the wizard: it may onboard and hasn't answered or
// skipped the first step yet.
export async function shouldOnboard(user: Account, now = new Date()) {
  return canOnboard(user, now) && !(await getOnboardingAnswers(user.id))
}
