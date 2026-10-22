"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { cn } from "@sniptide/ui/lib/utils"
import { USERNAME_PATTERN } from "@workspace/auth/username"
import { useTranslations } from "next-intl"
import * as React from "react"
import { AutosaveStatus } from "@/components/autosave-status"
import { useSiteHost } from "@/components/site-host"
import { authClient } from "@/lib/auth-client"
import { useAutosave } from "@/lib/autosave/use-autosave"
import { updateAvatar, updateProfile } from "@/lib/settings-actions"
import { SaveStatus, SettingsSection } from "./section"

export interface ProfileState {
  name: string
  username: string
  email: string
  emailVerified: boolean
  image: string | null
  initials: string
}

const AVATAR_SIZE = 160

// Crops to a centred square and scales to 160px, so the stored data URL stays a few KB.
async function resizeAvatar(file: File) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = AVATAR_SIZE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas unavailable")
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  )
  return canvas.toDataURL("image/jpeg", 0.85)
}

function useUsernameCheck(username: string, current: string) {
  const [status, setStatus] = React.useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle")

  React.useEffect(() => {
    if (!username || username === current) return setStatus("idle")
    if (!USERNAME_PATTERN.test(username)) return setStatus("invalid")

    setStatus("checking")
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data } = await authClient.isUsernameAvailable({ username })
      if (!cancelled) setStatus(data?.available ? "available" : "taken")
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [username, current])

  return status
}

// The name saves after a pause in typing. The username changes the address of the profile, so it
// only counts once typing stops (leaving the field or Enter) and the name is free.
export function ProfileSection({ profile }: { profile: ProfileState }) {
  const t = useTranslations("Settings")
  const host = useSiteHost()
  const [name, setName] = React.useState(profile.name)
  const [username, setUsername] = React.useState(profile.username)
  const [committedUsername, setCommittedUsername] = React.useState(profile.username)
  const [savedUsername, setSavedUsername] = React.useState(profile.username)
  const [image, setImage] = React.useState(profile.image)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = React.useTransition()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const usernameStatus = useUsernameCheck(username, savedUsername)

  const profileValue = React.useMemo(
    () => ({
      name: name.trim(),
      username:
        committedUsername === username && usernameStatus === "available" ? username : savedUsername,
    }),
    [name, username, committedUsername, usernameStatus, savedUsername],
  )
  const { state } = useAutosave({
    value: profileValue,
    initial: { name: profile.name, username: profile.username },
    validate: (next) => (next.name ? null : t("enterADisplayName")),
    async save(sent) {
      const result = await updateProfile(sent)
      if (!result.ok) return result
      setSavedUsername(sent.username)
      return { ok: true }
    },
  })

  function changeAvatar(next: string | null) {
    const previous = image
    setImage(next)
    startTransition(async () => {
      const result = await updateAvatar(next).catch(() => null)
      if (!result?.ok) {
        setImage(previous)
        setStatus({
          ok: false,
          message: result?.error ?? t("couldnTUpdateYourAvatarTry"),
        })
      } else {
        setStatus({ ok: true, message: next ? t("avatarUpdated") : t("avatarRemoved") })
      }
    })
  }

  return (
    <SettingsSection title={t("profile")} description={t("shownOnYourPublicPastesAnd")}>
      <div className="flex items-center gap-3">
        <Avatar className="size-14 rounded-lg font-heading text-lg font-bold">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback>{profile.initials}</AvatarFallback>
        </Avatar>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            try {
              changeAvatar(await resizeAvatar(file))
            } catch {
              setStatus({ ok: false, message: t("thatImageCouldnTBeRead") })
            }
          }}
        />
        <Button
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          {t("upload")}
        </Button>
        {image ? (
          <Button
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => changeAvatar(null)}
            className="text-muted-foreground"
          >
            {t("remove")}
          </Button>
        ) : null}
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display-name">{t("displayName")}</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
              className="text-base lg:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-username">{t("username")}</Label>
            <div
              className={cn(
                "flex h-10 items-center overflow-hidden rounded-lg border border-input focus-within:border-2 focus-within:border-primary",
                (usernameStatus === "taken" || usernameStatus === "invalid") &&
                  "border-destructive",
              )}
            >
              <span className="flex h-full items-center border-r border-input bg-sidebar pr-2 pl-3 font-mono text-xs text-muted-foreground">
                {host}/@
              </span>
              <input
                id="settings-username"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase().trim())}
                onBlur={() => setCommittedUsername(username)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  setCommittedUsername(username)
                }}
                maxLength={30}
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="settings-username-status"
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base outline-none lg:text-[13px]"
              />
              <span
                id="settings-username-status"
                aria-live="polite"
                className={cn(
                  "shrink-0 pr-3 text-xs font-medium",
                  usernameStatus === "available" ? "text-link" : "text-destructive",
                )}
              >
                {usernameStatus === "available"
                  ? t("available")
                  : usernameStatus === "taken"
                    ? t("taken")
                    : usernameStatus === "invalid"
                      ? t("invalid")
                      : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AutosaveStatus state={state} />
          <SaveStatus status={status} />
        </div>
      </form>
    </SettingsSection>
  )
}
