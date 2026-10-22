"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@sniptide/ui/components/alert-dialog"
import { Button } from "@sniptide/ui/components/button"
import { Checkbox } from "@sniptide/ui/components/checkbox"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { cn } from "@sniptide/ui/lib/utils"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { NewPasswordField } from "@/components/auth/password-field"
import { GitHubIcon, GoogleIcon } from "@/components/auth/social-buttons"
import {
  changeEmail,
  revokeOtherSessions,
  revokeSession,
  setPassword,
  unlinkProvider,
} from "@/lib/account/actions"
import type { AccountSecurity, LinkedProvider } from "@/lib/account/store"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import { runAction } from "@/lib/feedback"
import { formatDate, timeAgo } from "@/lib/format"
import type { Locale } from "@/lib/i18n/config"
import { SaveStatus, SettingsSection } from "./section"

type Status = { ok: boolean; message: string } | null

const fieldClass = "text-base lg:text-sm"

export function EmailSection({
  email,
  emailVerified,
  hasPassword,
  emailAvailable,
}: {
  email: string
  emailVerified: boolean
  hasPassword: boolean
  emailAvailable: boolean
}) {
  const t = useTranslations("Settings")
  const router = useRouter()
  const [status, setStatus] = React.useState<Status>(null)
  const [pending, startTransition] = React.useTransition()
  // A verified address can only be changed through a confirmation email.
  const locked = emailVerified && !emailAvailable

  return (
    <SettingsSection title={t("email")} description={t("emailSectionDescription")}>
      <div className="rounded-lg flex h-10 items-center gap-3 border border-input bg-sidebar px-3">
        <span className="min-w-0 flex-1 truncate text-base lg:text-sm">{email}</span>
        <span
          className={cn(
            "shrink-0 text-xs font-medium",
            emailVerified ? "text-link" : "text-muted-foreground",
          )}
        >
          {emailVerified ? t("verified") : t("notVerified")}
        </span>
      </div>
      {locked ? (
        <p className="text-[13px] text-muted-foreground">{t("emailChangeNeedsDelivery")}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const data = new FormData(form)
            const newEmail = String(data.get("new-email") ?? "")
            setStatus(null)
            startTransition(async () => {
              const result = await changeEmail({
                newEmail,
                password: hasPassword ? String(data.get("email-password") ?? "") : undefined,
              }).catch(() => null)
              if (!result) return setStatus({ ok: false, message: t("couldnTSaveTryAgain") })
              if (!result.ok) return setStatus({ ok: false, message: result.error })
              form.reset()
              setStatus({
                ok: true,
                message:
                  result.status === "confirm"
                    ? t("emailChangeConfirm", { email })
                    : emailAvailable
                      ? t("emailChangedVerify")
                      : t("emailChanged"),
              })
              router.refresh()
            })
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-email">{t("newEmail")}</Label>
              <Input
                id="new-email"
                name="new-email"
                type="email"
                autoComplete="email"
                required
                className={fieldClass}
              />
            </div>
            {hasPassword ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-password">{t("currentPassword")}</Label>
                <Input
                  id="email-password"
                  name="email-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={fieldClass}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" size="lg" loading={pending}>
              {pending ? t("changingEmail") : t("changeEmail")}
            </Button>
            <SaveStatus status={status} />
          </div>
        </form>
      )}
    </SettingsSection>
  )
}

export function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("Settings")
  const router = useRouter()
  const [password, setNewPassword] = React.useState("")
  const [signOutOthers, setSignOutOthers] = React.useState(true)
  const [status, setStatus] = React.useState<Status>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title={t("password")}
      description={hasPassword ? t("passwordDescription") : t("passwordDescriptionNone")}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const currentPassword = String(new FormData(form).get("current-password") ?? "")
          setStatus(null)
          startTransition(async () => {
            if (hasPassword) {
              const { error } = await authClient
                .changePassword({
                  currentPassword,
                  newPassword: password,
                  revokeOtherSessions: signOutOthers,
                })
                .catch(() => ({ error: { code: undefined, message: undefined } }))
              if (error)
                return setStatus({
                  ok: false,
                  message:
                    error.code === "INVALID_PASSWORD"
                      ? t("wrongCurrentPassword")
                      : error.code === "PASSWORD_TOO_SHORT"
                        ? t("passwordTooShort")
                        : (error.message ?? t("couldnTChangePassword")),
                })
            } else {
              const result = await setPassword(password).catch(() => null)
              if (!result?.ok)
                return setStatus({
                  ok: false,
                  message: result?.error ?? t("couldnTChangePassword"),
                })
            }
            form.reset()
            setNewPassword("")
            setStatus({
              ok: true,
              message: !hasPassword
                ? t("passwordSet")
                : signOutOthers
                  ? t("passwordChangedSignedOut")
                  : t("passwordChanged"),
            })
            router.refresh()
          })
        }}
      >
        {/* Lets password managers pair the new password with the account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <div className="grid gap-4 sm:grid-cols-2">
          {hasPassword ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">{t("currentPassword")}</Label>
              <Input
                id="current-password"
                name="current-password"
                type="password"
                autoComplete="current-password"
                required
                className={fieldClass}
              />
            </div>
          ) : null}
          <NewPasswordField
            id="new-password"
            label={t("newPassword")}
            value={password}
            onChange={setNewPassword}
            className={fieldClass}
          />
        </div>
        {hasPassword ? (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={signOutOthers}
              onCheckedChange={(checked) => setSignOutOthers(checked)}
            />
            {t("signOutOtherDevices")}
          </Label>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" size="lg" loading={pending}>
            {hasPassword ? t("changePassword") : t("addPassword")}
          </Button>
          <SaveStatus status={status} />
        </div>
      </form>
    </SettingsSection>
  )
}

const providers = [
  { id: "github", name: "GitHub", icon: GitHubIcon },
  { id: "google", name: "Google", icon: GoogleIcon },
] as const

// GitHub and Google as extra ways to sign in. Providers this instance has no OAuth app for stay
// listed when already connected, so they can still be removed.
export function ConnectedAccountsSection({
  linked,
  available,
  linkError,
}: {
  linked: AccountSecurity["linked"]
  available: SocialProvider[]
  linkError: string | null
}) {
  const t = useTranslations("Settings")
  const locale: Locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = React.useState<LinkedProvider | null>(null)
  const [error, setError] = React.useState(linkError)

  const rows = providers.filter(
    ({ id }) => available.includes(id) || linked.some((row) => row.provider === id),
  )
  if (!rows.length) return null

  async function connect(provider: LinkedProvider) {
    setPending(provider)
    setError(null)
    const { error } = await authClient
      .linkSocial({
        provider,
        callbackURL: "/settings?tab=account",
        errorCallbackURL: "/settings?tab=account",
      })
      .catch(() => ({ error: { message: undefined } }))
    if (error) {
      setPending(null)
      setError(t("couldnTConnect"))
    }
  }

  async function disconnect(provider: LinkedProvider, name: string) {
    setPending(provider)
    setError(null)
    const result = await runAction(() => unlinkProvider(provider), {
      success: t("accountDisconnected", { provider: name }),
      error: t("couldnTSaveTryAgain"),
    })
    setPending(null)
    if (result.ok) router.refresh()
  }

  return (
    <SettingsSection title={t("connectedAccounts")} description={t("connectedAccountsDescription")}>
      <ul
        aria-label={t("connectedAccounts")}
        className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border"
      >
        {rows.map(({ id, name, icon: Icon }) => {
          const connection = linked.find((row) => row.provider === id)
          return (
            <li key={id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Icon />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {connection
                      ? t("connectedOn", { date: formatDate(connection.linkedAt, locale) })
                      : t("notConnected")}
                  </span>
                </div>
              </div>
              {connection ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={pending === id}
                  disabled={pending !== null}
                  onClick={() => disconnect(id, name)}
                >
                  {t("disconnect")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  loading={pending === id}
                  disabled={pending !== null}
                  onClick={() => connect(id)}
                >
                  {t("connect")}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <FormError variant="inline" message={error} />
    </SettingsSection>
  )
}

export function SessionsSection({
  sessions,
  demo,
}: {
  sessions: AccountSecurity["sessions"]
  demo: boolean
}) {
  const t = useTranslations("Settings")
  const locale: Locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const others = sessions.filter((session) => !session.current).length

  async function run(id: string, action: () => Promise<{ ok: boolean }>, success: string) {
    setPending(id)
    const result = await runAction(action, { success, error: t("couldnTSaveTryAgain") })
    setPending(null)
    if (result.ok) router.refresh()
  }

  return (
    <SettingsSection title={t("sessions")} description={t("sessionsDescription")}>
      {demo ? (
        <p className="text-[13px] text-muted-foreground">{t("sessionsDemo")}</p>
      ) : (
        <>
          <ul
            aria-label={t("sessions")}
            className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border"
          >
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {session.browser && session.os
                      ? t("deviceName", { browser: session.browser, os: session.os })
                      : (session.browser ?? session.os ?? t("unknownDevice"))}
                    {session.current ? (
                      <span className="text-xs font-medium text-link">{t("thisDevice")}</span>
                    ) : null}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {t("lastActive", { time: timeAgo(session.lastActiveAt, Date.now(), locale) })}
                    {session.ipAddress ? (
                      <>
                        {" · "}
                        <span className="font-mono text-[12px]">{session.ipAddress}</span>
                      </>
                    ) : null}
                  </span>
                </div>
                {session.current ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={pending === session.id}
                    disabled={pending !== null}
                    onClick={() =>
                      run(session.id, () => revokeSession(session.id), t("sessionSignedOut"))
                    }
                  >
                    {t("signOut")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {others > 0 ? (
            <Button
              variant="outline"
              size="lg"
              className="self-start"
              loading={pending === "others"}
              disabled={pending !== null}
              onClick={() => run("others", revokeOtherSessions, t("otherSessionsSignedOut"))}
            >
              {t("signOutOtherSessions", { count: others })}
            </Button>
          ) : null}
        </>
      )}
    </SettingsSection>
  )
}

export function DeleteAccountSection({
  pasteCount,
  hasPassword,
}: {
  pasteCount: number
  hasPassword: boolean
}) {
  const t = useTranslations("Settings")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title={t("deleteAccount")}
      description={t("deleteAccountDescription", { count: pasteCount })}
    >
      <div className="rounded-lg flex flex-col gap-3 border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-foreground/80">{t("copyAnythingYouWantToKeep")}</p>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            setError(null)
          }}
        >
          <AlertDialogTrigger render={<Button size="lg" variant="destructive" />}>
            {t("deleteAccount")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t("deleteYourAccount")}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasPassword ? t("enterYourPasswordToConfirmYour") : t("confirmDeleteNoPassword")}
            </AlertDialogDescription>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                const password = String(new FormData(event.currentTarget).get("password") ?? "")
                startTransition(async () => {
                  const { error } = await authClient
                    .deleteUser(hasPassword ? { password } : {})
                    .catch(() => ({ error: { code: undefined, message: undefined } }))
                  if (error)
                    return setError(
                      error.code === "INVALID_PASSWORD"
                        ? t("wrongCurrentPassword")
                        : error.code === "SESSION_EXPIRED"
                          ? t("signInAgainToDelete")
                          : (error.message ?? t("couldnTDeleteYourAccount")),
                    )
                  router.replace("/sign-up")
                  router.refresh()
                })
              }}
            >
              {hasPassword ? (
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-label={t("password")}
                  placeholder={t("password")}
                  aria-invalid={Boolean(error)}
                  className="h-10 text-base lg:text-sm"
                />
              ) : null}
              <FormError variant="inline" message={error} />
              <AlertDialogFooter>
                <AlertDialogClose render={<Button type="button" variant="outline" size="lg" />}>
                  {t("cancel")}
                </AlertDialogClose>
                <Button type="submit" size="lg" variant="destructive" loading={pending}>
                  {pending ? t("deleting") : t("deleteAccount")}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingsSection>
  )
}
