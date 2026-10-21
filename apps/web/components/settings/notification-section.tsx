"use client"

import { Button } from "@sniptide/ui/components/button"
import { Switch } from "@sniptide/ui/components/switch"
import * as React from "react"
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications/types"
import type { NotificationChannel, NotificationPreferences } from "@/lib/preferences"
import {
  sendNotificationVerificationEmail,
  updateNotificationPreference,
} from "@/lib/settings-actions"
import { SaveStatus, SettingsSection } from "./section"

const events = {
  shared: { label: "Shared with you", description: "Someone invites you to a paste." },
  burned: { label: "Burn after read", description: "Your paste is read and moved to trash." },
  expiring: { label: "Expiring soon", description: "Your paste will expire within a day." },
  views: { label: "View milestones", description: "Your paste reaches a view milestone." },
} satisfies Record<NotificationKind, { label: string; description: string }>

export function NotificationSection({
  initial,
  emailAvailable,
  emailVerified,
}: {
  initial: NotificationPreferences
  emailAvailable: boolean
  emailVerified: boolean
}) {
  const [preferences, setPreferences] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)

  async function change(kind: NotificationKind, channel: NotificationChannel, enabled: boolean) {
    const previous = preferences
    setPreferences({ ...preferences, [kind]: { ...preferences[kind], [channel]: enabled } })
    setPending(true)
    setStatus(null)
    const result = await updateNotificationPreference({ kind, channel, enabled }).catch(() => null)
    if (!result?.ok) setPreferences(previous)
    setStatus(
      result?.ok
        ? { ok: true, message: "Saved." }
        : { ok: false, message: result?.error ?? "Couldn't save. Try again." },
    )
    setPending(false)
  }

  return (
    <SettingsSection
      title="Notifications"
      description="Choose how you hear about activity on your pastes. Email is off by default."
    >
      {!emailAvailable ? (
        <p id="notification-email-unavailable" className="text-sm text-muted-foreground">
          Email delivery is not configured on this server. Your in-app notifications still work.
        </p>
      ) : null}
      {emailAvailable && !emailVerified ? (
        <div className="flex flex-col gap-3">
          <p id="notification-email-unverified" className="text-sm text-muted-foreground">
            Verify your email address before turning on notification emails.
          </p>
          <Button
            variant="outline"
            className="self-start"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              const result = await sendNotificationVerificationEmail().catch(() => null)
              setStatus(
                result?.ok
                  ? {
                      ok: true,
                      message:
                        "Verification email sent. Open the link in your inbox, then reload these settings.",
                    }
                  : {
                      ok: false,
                      message: result?.error ?? "Couldn't send the verification email. Try again.",
                    },
              )
              setPending(false)
            }}
          >
            Send verification email
          </Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg divide-y divide-border border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_60px_60px] items-center gap-2 px-3 py-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_90px_90px] sm:px-4">
          <span>Activity</span>
          <span className="text-center">In-app</span>
          <span className="text-center">Email</span>
        </div>
        {NOTIFICATION_KINDS.map((kind) => (
          <div
            key={kind}
            className="grid grid-cols-[minmax(0,1fr)_60px_60px] items-center gap-2 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_90px_90px] sm:px-4"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{events[kind].label}</span>
              <span className="text-xs text-muted-foreground">{events[kind].description}</span>
            </div>
            {(["inApp", "email"] as const).map((channel) => (
              <div key={channel} className="flex justify-center">
                <Switch
                  aria-label={`${events[kind].label}, ${channel === "inApp" ? "in-app" : "email"}`}
                  aria-describedby={
                    channel === "email" && !emailAvailable
                      ? "notification-email-unavailable"
                      : channel === "email" && !emailVerified
                        ? "notification-email-unverified"
                        : undefined
                  }
                  checked={preferences[kind][channel]}
                  disabled={pending || (channel === "email" && (!emailAvailable || !emailVerified))}
                  onCheckedChange={(enabled) => void change(kind, channel, enabled)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <SaveStatus status={status} />
    </SettingsSection>
  )
}
