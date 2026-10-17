"use server"

import { USERNAME_PATTERN } from "@workspace/auth/username"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import { getAuth, getSession } from "@/lib/auth"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import type { Preferences } from "@/lib/preferences"
import { parsePreferences, preferencesSchema } from "@/lib/preferences-schema"

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

export async function updatePreferences(patch: Partial<Preferences>): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInSettings") }

  const current = parsePreferences(session.user.preferences)
  const next = preferencesSchema.parse({ ...current, ...patch })
  return updateUser({ preferences: JSON.stringify(next) })
}
