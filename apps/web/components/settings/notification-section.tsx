"use client"

import { Button } from "@sniptide/ui/components/button"
import { Switch } from "@sniptide/ui/components/switch"
import type { EmailTopic } from "@workspace/email/topics"
import { useTranslations } from "next-intl"
import * as React from "react"
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications/types"
import type { NotificationChannel, NotificationPreferences } from "@/lib/preferences"
import {
  sendNotificationVerificationEmail,
  updateNotificationPreference,
  updateProductEmails,
} from "@/lib/settings-actions"
import { SaveStatus, SettingsSection } from "./section"

export function NotificationSection({
  initial,
  emailAvailable,
  emailVerified,
  productEmails,
}: {
  initial: NotificationPreferences
  emailAvailable: boolean
  emailVerified: boolean
  productEmails: { kinds: EmailTopic[]; enabled: EmailTopic[] }
}) {
  const t = useTranslations("Settings")
  const [preferences, setPreferences] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [topics, setTopics] = React.useState(productEmails.enabled)

  async function changeTopic(topic: EmailTopic, enabled: boolean) {
    const previous = topics
    setTopics(enabled ? [...topics, topic] : topics.filter((kind) => kind !== topic))
    setPending(true)
    setStatus(null)
    const result = await updateProductEmails(enabled, topic).catch(() => null)
    if (!result?.ok) setTopics(previous)
    setStatus(
      result?.ok
        ? { ok: true, message: t("saved") }
        : { ok: false, message: result?.error ?? t("couldnTSaveTryAgain") },
    )
    setPending(false)
  }

  async function change(kind: NotificationKind, channel: NotificationChannel, enabled: boolean) {
    const previous = preferences
    setPreferences({ ...preferences, [kind]: { ...preferences[kind], [channel]: enabled } })
    setPending(true)
    setStatus(null)
    const result = await updateNotificationPreference({ kind, channel, enabled }).catch(() => null)
    if (!result?.ok) setPreferences(previous)
    setStatus(
      result?.ok
        ? { ok: true, message: t("saved") }
        : { ok: false, message: result?.error ?? t("couldnTSaveTryAgain") },
    )
    setPending(false)
  }

  return (
    <SettingsSection
      title={t("notifications")}
      description={t("notificationsDescription")}
      repeatsHeading
    >
      {!emailAvailable ? (
        <p id="notification-email-unavailable" className="text-sm text-muted-foreground">
          {t("notificationEmailUnavailable")}
        </p>
      ) : null}
      {emailAvailable && !emailVerified ? (
        <div className="flex flex-col gap-3">
          <p id="notification-email-unverified" className="text-sm text-muted-foreground">
            {t("notificationEmailUnverified")}
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
                      message: t("verificationEmailSent"),
                    }
                  : {
                      ok: false,
                      message: result?.error ?? t("couldnTSendVerificationEmail"),
                    },
              )
              setPending(false)
            }}
          >
            {t("sendVerificationEmail")}
          </Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg divide-y divide-border border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_60px_60px] items-center gap-2 px-3 py-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_90px_90px] sm:px-4">
          <span>{t("notificationActivity")}</span>
          <span className="text-center">{t("notificationInApp")}</span>
          <span className="text-center">{t("notificationEmail")}</span>
        </div>
        {NOTIFICATION_KINDS.map((kind) => (
          <div
            key={kind}
            className="grid grid-cols-[minmax(0,1fr)_60px_60px] items-center gap-2 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_90px_90px] sm:px-4"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t(`notificationEvents.${kind}.label`)}</span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {t(`notificationEvents.${kind}.description`)}
              </span>
            </div>
            {(["inApp", "email"] as const).map((channel) => (
              <div key={channel} className="flex justify-center">
                <Switch
                  aria-label={t("notificationSwitch", {
                    event: t(`notificationEvents.${kind}.label`),
                    channel: t(channel === "inApp" ? "notificationInApp" : "notificationEmail"),
                  })}
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
      {productEmails.kinds.length ? (
        <div className="flex flex-col gap-2">
          <div className="divide-y divide-border rounded-lg border border-border">
            {productEmails.kinds.map((topic) => {
              const checked = topics.includes(topic)
              return (
                <div
                  key={topic}
                  className="grid grid-cols-[minmax(0,1fr)_60px] items-center gap-2 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_90px] sm:px-4"
                >
                  <div className="flex flex-col gap-1">
                    <span id={`product-emails-${topic}-label`} className="text-sm font-medium">
                      {t(`productEmails.${topic}.label`)}
                    </span>
                    <span
                      id={`product-emails-${topic}-description`}
                      className="text-[13px] leading-[18px] text-muted-foreground"
                    >
                      {t(`productEmails.${topic}.description`)}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      aria-labelledby={`product-emails-${topic}-label`}
                      aria-describedby={
                        emailVerified
                          ? `product-emails-${topic}-description`
                          : "notification-email-unverified"
                      }
                      checked={checked}
                      disabled={pending || (!emailVerified && !checked)}
                      onCheckedChange={(enabled) => void changeTopic(topic, enabled)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {t("productEmails.note")}
          </p>
        </div>
      ) : null}
      <SaveStatus status={status} />
    </SettingsSection>
  )
}
