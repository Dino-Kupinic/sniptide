"use server"

import { USERNAME_PATTERN } from "@workspace/auth/username"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import { getAuth, getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import { NOTIFICATION_KINDS } from "@/lib/notifications/types"
import { changePreferences } from "@/lib/preference-store"
import type { Preferences } from "@/lib/preferences"
import { preferencesSchema } from "@/lib/preferences-schema"

type Result = { ok: true } | { ok: false; error: string }

async function updateUser(body: Record<string, unknown>): Promise<Result> {
  const auth = await getAuth()
  try {
    await auth.api.updateUser({ headers: await headers(), body })
  } catch {
    return { ok: false, error: await actionError("saveFailed") }
  }
  revalidatePath("/", "layout")
  return { ok: true }
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter a display name.").max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      USERNAME_PATTERN,
      "Usernames are 3–30 lowercase letters, numbers, hyphens or underscores.",
    ),
})

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInProfile") }

  const parsed = profileSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      error: await translateActionError(parsed.error.issues[0]?.message ?? "Check your profile."),
    }

  const { name, username } = parsed.data
  const body: Record<string, unknown> = { name }
  if (username !== session.user.username) {
    const auth = await getAuth()
    const { available } = await auth.api.isUsernameAvailable({ body: { username } })
    if (!available) return { ok: false, error: await actionError("usernameTaken", { username }) }
    body.username = username
    body.displayUsername = username
  }

  return updateUser(body)
}

// Avatars are small square JPEGs resized in the browser, kept as data URLs on user.image until
// there's object storage. 64 KB is plenty for 160×160.
const avatarSchema = z
  .string()
  .max(64 * 1024, "That image is too large.")
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/,
    "Upload a JPEG, PNG or WebP image.",
  )
  .nullable()

export async function updateAvatar(image: string | null): Promise<Result> {
  if (!(await getSession())) return { ok: false, error: await actionError("signInAvatar") }

  const parsed = avatarSchema.safeParse(image)
  if (!parsed.success)
    return {
      ok: false,
      error: await translateActionError(
        parsed.error.issues[0]?.message ?? "That image can't be used.",
      ),
    }

  return updateUser({ image: parsed.data })
}

const generalPatchSchema = preferencesSchema.omit({ notifications: true }).partial().strict()

export async function updatePreferences(
  patch: Partial<Omit<Preferences, "notifications">>,
): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }
  const parsed = generalPatchSchema.safeParse(patch)
  if (!parsed.success) return { ok: false, error: "Check your settings." }
  const saved = await changePreferences(session.user.id, (current) => ({
    ...current,
    ...parsed.data,
  }))
  if (!saved) return { ok: false, error: await actionError("signInSettings") }
  revalidatePath("/", "layout")
  return { ok: true }
}

const notificationPatchSchema = z
  .object({
    kind: z.enum(NOTIFICATION_KINDS),
    channel: z.enum(["inApp", "email"]),
    enabled: z.boolean(),
  })
  .strict()

export async function updateNotificationPreference(
  input: z.input<typeof notificationPatchSchema>,
): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Sign in again to change settings." }
  const parsed = notificationPatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Check your notification settings." }
  const { kind, channel, enabled } = parsed.data
  if (channel === "email" && enabled && !getConfig().smtp)
    return { ok: false, error: "Email delivery is not configured on this server." }
  if (channel === "email" && enabled) {
    const [account] = await getDb()
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, session.user.id))
    if (!account?.emailVerified)
      return { ok: false, error: "Verify your email address before enabling notification emails." }
  }
  const saved = await changePreferences(session.user.id, (current) => ({
    ...current,
    notifications: {
      ...current.notifications,
      [kind]: { ...current.notifications[kind], [channel]: enabled },
    },
  }))
  if (!saved) return { ok: false, error: "Sign in again to change settings." }
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function sendNotificationVerificationEmail(): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Sign in again to verify your email." }
  if (!getConfig().smtp)
    return { ok: false, error: "Email delivery is not configured on this server." }
  const [account] = await getDb()
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, session.user.id))
  if (!account) return { ok: false, error: "Sign in again to verify your email." }
  if (account.emailVerified) return { ok: true }
  try {
    const auth = await getAuth()
    await auth.api.sendVerificationEmail({
      headers: await headers(),
      body: { email: account.email, callbackURL: "/settings?tab=notifications" },
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "Couldn't send the verification email. Try again later." }
  }
}
