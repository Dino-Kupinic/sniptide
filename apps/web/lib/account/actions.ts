"use server"

import { user } from "@workspace/db/schema"
import { isAPIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import { getAuth, getSession, isDemoMode, isEmailAvailable } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { actionError } from "@/lib/i18n/action-errors"
import { hasPassword, linkedAccountId, sessionToken } from "./store"

type Result = { ok: true } | { ok: false; error: string }

// Better Auth's error code, or null for anything that isn't one of its API errors.
function errorCode(error: unknown) {
  if (!isAPIError(error)) return null
  return typeof error.body?.code === "string" ? error.body.code : null
}

const ACCOUNT_PATH = "/settings?tab=account"

async function failure(error: unknown, fallback: Parameters<typeof actionError>[0]) {
  if (isDemoMode() && isAPIError(error) && error.statusCode === 403)
    return { ok: false as const, error: await actionError("demoLocked") }
  return { ok: false as const, error: await actionError(fallback) }
}

const emailSchema = z.object({
  newEmail: z.email().max(254),
  password: z.string().max(128).optional(),
})

// With SMTP: a verified address approves the change by mail first, and the new address gets a
// verification link. An unverified address changes at once, as it does without SMTP, where no
// address can be verified. Accounts with a password confirm it either way, so a session left
// open on a shared computer isn't enough to take the account.
export async function changeEmail(
  input: z.input<typeof emailSchema>,
): Promise<{ ok: true; status: "changed" | "confirm" } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: await actionError("emailInvalid") }
  const newEmail = parsed.data.newEmail.trim().toLowerCase()

  const db = getDb()
  const [before] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, session.user.id))
  if (!before) return { ok: false, error: await actionError("signInAccount") }
  if (newEmail === before.email.toLowerCase())
    return { ok: false, error: await actionError("emailSame") }
  if (before.emailVerified && !isEmailAvailable())
    return { ok: false, error: await actionError("emailDeliveryOff") }

  const auth = await getAuth()
  const requestHeaders = await headers()
  if (await hasPassword(session.user.id)) {
    if (!parsed.data.password) return { ok: false, error: await actionError("wrongPassword") }
    try {
      await auth.api.verifyPassword({
        headers: requestHeaders,
        body: { password: parsed.data.password },
      })
    } catch (error) {
      if (errorCode(error) === "INVALID_PASSWORD")
        return { ok: false, error: await actionError("wrongPassword") }
      return failure(error, "emailChangeFailed")
    }
  }

  try {
    await auth.api.changeEmail({
      headers: requestHeaders,
      body: { newEmail, callbackURL: ACCOUNT_PATH },
    })
  } catch (error) {
    return failure(error, "emailChangeFailed")
  }

  if (before.emailVerified) return { ok: true, status: "confirm" }
  // An address that's already taken is left alone without an error, so Better Auth doesn't tell
  // strangers which addresses have accounts. Signed in, the person can be told.
  const [after] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, session.user.id))
  if (after?.email !== newEmail) return { ok: false, error: await actionError("emailUnavailable") }
  revalidatePath("/", "layout")
  return { ok: true, status: "changed" }
}

const passwordSchema = z.string().min(8).max(128)

// For accounts that signed up with GitHub or Google: adds a password as a second way in.
// Changing an existing password goes through Better Auth's change-password from the browser.
export async function setPassword(newPassword: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  const parsed = passwordSchema.safeParse(newPassword)
  if (!parsed.success)
    return {
      ok: false,
      error: await actionError(newPassword.length > 128 ? "passwordTooLong" : "passwordTooShort"),
    }
  try {
    const auth = await getAuth()
    await auth.api.setPassword({ headers: await headers(), body: { newPassword: parsed.data } })
  } catch (error) {
    return failure(error, "passwordSetFailed")
  }
  revalidatePath(ACCOUNT_PATH)
  return { ok: true }
}

export async function revokeSession(sessionId: string): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  if (isDemoMode()) return { ok: false, error: await actionError("demoLocked") }
  const token = await sessionToken(session.user.id, sessionId)
  // Already gone, by expiry or from another device.
  if (!token) return { ok: true }
  try {
    const auth = await getAuth()
    await auth.api.revokeSession({ headers: await headers(), body: { token } })
  } catch (error) {
    return failure(error, "sessionRevokeFailed")
  }
  revalidatePath(ACCOUNT_PATH)
  return { ok: true }
}

export async function revokeOtherSessions(): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  if (isDemoMode()) return { ok: false, error: await actionError("demoLocked") }
  try {
    const auth = await getAuth()
    await auth.api.revokeOtherSessions({ headers: await headers() })
  } catch (error) {
    return failure(error, "sessionRevokeFailed")
  }
  revalidatePath(ACCOUNT_PATH)
  return { ok: true }
}

export async function unlinkProvider(providerId: "github" | "google"): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInAccount") }
  if (providerId !== "github" && providerId !== "google")
    return { ok: false, error: await actionError("invalid") }
  const accountId = await linkedAccountId(session.user.id, providerId)
  // Already disconnected, from another tab or device.
  if (!accountId) return { ok: true }
  try {
    const auth = await getAuth()
    await auth.api.unlinkAccount({ headers: await headers(), body: { accountId } })
  } catch (error) {
    const code = errorCode(error)
    if (code === "FAILED_TO_UNLINK_LAST_ACCOUNT")
      return { ok: false, error: await actionError("unlinkLast") }
    // Unlinking needs a session from the last day.
    if (code === "SESSION_EXPIRED") return { ok: false, error: await actionError("signInFresh") }
    return failure(error, "unlinkFailed")
  }
  revalidatePath(ACCOUNT_PATH)
  return { ok: true }
}
