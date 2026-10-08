"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { cn } from "@sniptide/ui/lib/utils"
import { USERNAME_PATTERN } from "@workspace/auth/username"
import * as React from "react"
import { useSiteHost } from "@/components/site-host"
import { authClient } from "@/lib/auth-client"
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

export function ProfileSection({ profile }: { profile: ProfileState }) {
  const host = useSiteHost()
  const [name, setName] = React.useState(profile.name)
  const [username, setUsername] = React.useState(profile.username)
  const [image, setImage] = React.useState(profile.image)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = React.useTransition()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const usernameStatus = useUsernameCheck(username, profile.username)
  const dirty = name.trim() !== profile.name || username !== profile.username

  function changeAvatar(next: string | null) {
    const previous = image
    setImage(next)
    startTransition(async () => {
      const result = await updateAvatar(next)
      if (!result.ok) {
        setImage(previous)
        setStatus({ ok: false, message: result.error })
      } else {
        setStatus({ ok: true, message: next ? "Avatar updated." : "Avatar removed." })
      }
    })
  }

  return (
    <SettingsSection title="Profile" description="Shown on your public pastes and share pages.">
      <div className="flex items-center gap-3">
        <Avatar className="size-14 font-heading text-lg font-bold">
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
              setStatus({ ok: false, message: "That image couldn't be read." })
            }
          }}
        />
        <Button
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          Upload
        </Button>
        {image ? (
          <Button
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => changeAvatar(null)}
            className="text-muted-foreground"
          >
            Remove
          </Button>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          setStatus(null)
          startTransition(async () => {
            const result = await updateProfile({ name, username })
            setStatus(
              result.ok
                ? { ok: true, message: "Profile saved." }
                : { ok: false, message: result.error },
            )
          })
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display-name">Display name</Label>
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
            <Label htmlFor="settings-username">Username</Label>
            <div
              className={cn(
                "flex h-10 items-center border border-input focus-within:border-2 focus-within:border-primary",
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
                  usernameStatus === "available" ? "text-primary" : "text-destructive",
                )}
              >
                {usernameStatus === "available"
                  ? "Available"
                  : usernameStatus === "taken"
                    ? "Taken"
                    : usernameStatus === "invalid"
                      ? "Invalid"
                      : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-email">Email</Label>
          <div className="flex h-10 items-center border border-input bg-sidebar px-3">
            <input
              id="settings-email"
              value={profile.email}
              readOnly
              aria-describedby="settings-email-note"
              className="min-w-0 flex-1 bg-transparent text-base outline-none lg:text-sm"
            />
            <span
              className={cn(
                "text-xs font-medium",
                profile.emailVerified ? "text-primary" : "text-muted-foreground",
              )}
            >
              {profile.emailVerified ? "Verified" : "Not verified"}
            </span>
          </div>
          <p id="settings-email-note" className="text-xs text-muted-foreground">
            Changing your email needs verification by mail, which isn't set up yet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={
              !dirty ||
              pending ||
              usernameStatus === "taken" ||
              usernameStatus === "invalid" ||
              usernameStatus === "checking"
            }
          >
            {pending ? "Saving…" : "Save profile"}
          </Button>
          <SaveStatus status={status} />
        </div>
      </form>
    </SettingsSection>
  )
}
