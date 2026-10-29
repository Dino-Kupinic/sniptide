import "server-only"

import { signupSource } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { SIGNUP_SOURCE_WINDOW_DAYS } from "@/lib/signup-source"
import { DAY } from "@/lib/time"

// Whether to show the question: a recent account that hasn't answered or dismissed it yet.
export async function shouldAskSignupSource(
  user: { id: string; createdAt: Date | string },
  now = new Date(),
) {
  if (now.getTime() - new Date(user.createdAt).getTime() > SIGNUP_SOURCE_WINDOW_DAYS * DAY)
    return false
  const [answer] = await getDb()
    .select({ source: signupSource.source })
    .from(signupSource)
    .where(eq(signupSource.userId, user.id))
    .limit(1)
  return !answer
}
