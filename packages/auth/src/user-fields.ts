import { APIError } from "better-auth/api"

// Bounds on the user fields better-auth lets clients write (sign-up and /update-user), so they
// hold even for requests that skip the app's own forms and server actions.

export const NAME_MAX_LENGTH = 60
// Avatars are small JPEG, PNG or WebP data URLs (see the settings page).
export const AVATAR_MAX_LENGTH = 64 * 1024
const AVATAR_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
// Sign-in providers hand over their own avatar URL when the account is created.
const PROVIDER_IMAGE_MAX_LENGTH = 2048
export const PREFERENCES_MAX_LENGTH = 2048

type Mode = "create" | "update"

function reject(message: string): never {
  throw new APIError("BAD_REQUEST", { message })
}

function isAvatar(image: string) {
  return image.length <= AVATAR_MAX_LENGTH && AVATAR_DATA_URL.test(image)
}

function isProviderImage(image: string) {
  if (image.length > PROVIDER_IMAGE_MAX_LENGTH) return false
  try {
    return new URL(image).protocol === "https:"
  } catch {
    return false
  }
}

function isPreferences(value: string) {
  if (value.length > PREFERENCES_MAX_LENGTH) return false
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

// Checks the fields present in `data`. Accounts being created keep going with a shortened name
// and without an unusable image, since sign-in providers fill those in; updates are refused.
export function boundUserFields<T extends Record<string, unknown>>(data: T, mode: Mode): T {
  const next: Record<string, unknown> = { ...data }

  if (typeof next.name === "string") {
    const name = next.name.trim()
    if (mode === "update" && !name) reject("Enter a display name.")
    if (mode === "update" && name.length > NAME_MAX_LENGTH)
      reject(`Display names are up to ${NAME_MAX_LENGTH} characters.`)
    next.name = name.slice(0, NAME_MAX_LENGTH)
  }

  if (typeof next.image === "string") {
    const usable = isAvatar(next.image) || (mode === "create" && isProviderImage(next.image))
    if (!usable && mode === "update") reject("Upload a JPEG, PNG or WebP image up to 64 KB.")
    if (!usable) next.image = null
  }

  if (typeof next.preferences === "string" && !isPreferences(next.preferences)) {
    reject("Those settings can't be saved.")
  }

  return next as T
}
