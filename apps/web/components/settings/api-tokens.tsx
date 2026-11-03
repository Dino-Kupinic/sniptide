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
import { Input } from "@sniptide/ui/components/input"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Switch } from "@sniptide/ui/components/switch"
import { KeyRoundIcon, TerminalIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { CopyButton } from "@/components/paste/copy-button"
import { createApiToken, deleteEnvGroup, revokeApiToken } from "@/lib/api/token-actions"
import type { TokenExpiry, TokenSummary } from "@/lib/api/tokens"
import type { EnvGroupSummary } from "@/lib/env/store"
import { runAction } from "@/lib/feedback"
import { formatDate, timeAgo } from "@/lib/format"
import type { Locale } from "@/lib/i18n/config"
import { SaveStatus, SettingRow, SettingsSection } from "./section"

// Below sm the action moves under the name and meta line, so the meta line keeps the width.
const rowClass =
  "flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"

const expiryOptions: { value: TokenExpiry; label: string }[] = [
  { value: "30d", label: "30Days" },
  { value: "90d", label: "90Days" },
  { value: "1y", label: "1Year" },
  { value: "never", label: "never" },
]

// A destructive row action that asks first, since revoking a token or deleting an env group
// can't be undone.
function ConfirmButton({
  label,
  title,
  description,
  disabled,
  onConfirm,
}: {
  label: string
  title: string
  description: string
  disabled: boolean
  onConfirm: () => void
}) {
  const t = useTranslations("Settings")
  const [open, setOpen] = React.useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="destructive" size="lg" className="shrink-0" />}
        disabled={disabled}
      >
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button type="button" variant="outline" size="lg" />}>
            {t("cancel")}
          </AlertDialogClose>
          <Button
            variant="destructive"
            size="lg"
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            {label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function NewToken({ token, origin }: { token: string; origin: string }) {
  const t = useTranslations("Settings")
  // The token goes in through stdin, so it stays out of shell history and process lists.
  const login = `sniptide login --token-stdin --base-url ${origin}`
  return (
    <div
      role="status"
      className="rounded-lg flex flex-col gap-3 border border-primary/40 bg-primary/5 p-4"
    >
      <p className="text-sm font-medium">{t("copyYourNewTokenNow")}</p>
      <p className="text-[13px] text-muted-foreground">{t("itWonTBeShownAgain")}</p>
      <div className="flex items-center gap-2">
        <code className="rounded-lg min-w-0 flex-1 truncate border border-border bg-background px-3 py-2 font-mono text-[13px]">
          {token}
        </code>
        <CopyButton text={token} variant="outline" size="lg" />
      </div>
      <p className="text-[13px] text-muted-foreground">
        {t.rich("cliTokenHint", {
          command: (chunks) => <code className="font-mono text-foreground">{chunks}</code>,
          login,
        })}
      </p>
    </div>
  )
}

export function ApiTokensSection({ tokens, origin }: { tokens: TokenSummary[]; origin: string }) {
  const t = useTranslations("Settings")
  const locale: Locale = useLocale()
  const router = useRouter()
  const [write, setWrite] = React.useState(true)
  const [expiry, setExpiry] = React.useState<TokenExpiry>("90d")
  const [created, setCreated] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title={t("apiTokens")}
      description={t("forTheSniptideCLICodingAgents")}
      repeatsHeading
    >
      <form
        className="rounded-lg flex flex-col gap-4 border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const name = String(new FormData(form).get("name") ?? "")
          setStatus(null)
          startTransition(async () => {
            try {
              const result = await createApiToken({ name, write, expiry })
              if (!result.ok) return setStatus({ ok: false, message: result.error })
              setCreated(result.token)
              setStatus({ ok: true, message: t("tokenCreated") })
            } catch {
              return setStatus({ ok: false, message: t("couldnTCreateTheTokenTry") })
            }
            form.reset()
            router.refresh()
          })
        }}
      >
        <Input
          name="name"
          required
          maxLength={60}
          aria-label={t("tokenName")}
          placeholder={t("tokenNameLikeLaptopCLI")}
          className="h-10 text-base lg:text-sm"
        />
        <SettingRow
          id="token-write-label"
          label={t("writeAccess")}
          description={t("createPastesAndPushEnvGroups")}
        >
          <Switch
            aria-labelledby="token-write-label"
            checked={write}
            onCheckedChange={(checked) => setWrite(checked)}
          />
        </SettingRow>
        <SettingRow id="token-expiry-label" wide label={t("expires")}>
          <SegmentedControl
            aria-labelledby="token-expiry-label"
            value={expiry}
            onValueChange={setExpiry}
            options={expiryOptions.map((option) => ({ ...option, label: t(option.label) }))}
            className="shrink-0"
            itemClassName="px-2 whitespace-nowrap max-sm:py-[9px]"
          />
        </SettingRow>
        <Button type="submit" size="lg" loading={pending} className="self-start">
          <KeyRoundIcon />
          {pending ? t("creating") : t("createToken")}
        </Button>
        <SaveStatus status={status} />
      </form>

      {created ? <NewToken token={created} origin={origin} /> : null}

      {tokens.length ? (
        <ul
          aria-label={t("yourAPITokens")}
          className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border"
        >
          {tokens.map((token) => (
            <li key={token.id} className={rowClass}>
              <div className="flex min-w-0 max-w-full flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{token.name}</span>
                {token.connectedApp ? (
                  <span className="text-[12px] text-muted-foreground">
                    {t("connectedApp")} ·{" "}
                    <span className="font-mono">{token.scopes.join(" + ")}</span>
                  </span>
                ) : (
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {token.prefix}… · {token.scopes.join(" + ")}
                  </span>
                )}
                <span className="text-[12px] text-muted-foreground">
                  {t("tokenCreatedAt", { date: formatDate(token.createdAt, locale) })} ·{" "}
                  {token.lastUsedAt
                    ? t("tokenUsedAt", { time: timeAgo(token.lastUsedAt, Date.now(), locale) })
                    : t("neverUsed")}
                  {token.expiresAt
                    ? ` · ${t("tokenExpiresAt", { date: formatDate(token.expiresAt, locale) })}`
                    : ""}
                </span>
              </div>
              <ConfirmButton
                label={t("revoke")}
                title={t("revokeTokenTitle", { name: token.name })}
                description={t("revokeTokenDescription")}
                disabled={pending}
                onConfirm={() =>
                  startTransition(async () => {
                    const result = await runAction(() => revokeApiToken(token.id), {
                      success: t("tokenRevoked"),
                      error: t("couldnTRevokeTheTokenTry"),
                    })
                    if (result.ok) router.refresh()
                  })
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("noTokensYet")}</p>
      )}
      <a
        href="/docs/api"
        className="text-[13px] text-foreground underline underline-offset-4 hover:text-primary"
      >
        {t("apiReference")}
      </a>
    </SettingsSection>
  )
}

export function EnvGroupsSection({ groups }: { groups: EnvGroupSummary[] }) {
  const t = useTranslations("Settings")
  const locale: Locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title={t("envGroups")}
      description={t("environmentVariablesYouSyncWithSniptide")}
    >
      {groups.length ? (
        <ul
          aria-label={t("yourEnvGroups")}
          className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border"
        >
          {groups.map((group) => (
            <li key={group.slug} className={rowClass}>
              <div className="flex min-w-0 max-w-full flex-col gap-0.5">
                <span className="truncate font-mono text-sm">{group.slug}</span>
                <span className="text-[12px] text-muted-foreground">
                  {t("groupUpdated", {
                    count: group.variables,
                    time: timeAgo(group.updatedAt, Date.now(), locale),
                  })}
                </span>
              </div>
              <ConfirmButton
                label={t("delete")}
                title={t("deleteEnvGroupTitle", { slug: group.slug })}
                description={t("deleteEnvGroupDescription")}
                disabled={pending}
                onConfirm={() =>
                  startTransition(async () => {
                    const result = await runAction(() => deleteEnvGroup(group.slug), {
                      success: t("envGroupDeleted"),
                      error: t("couldnTDeleteTheEnvGroup"),
                    })
                    if (result.ok) router.refresh()
                  })
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg flex flex-col items-start gap-2 border border-dashed border-input p-5">
          <TerminalIcon className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">{t("noEnvGroupsYet")}</p>
          <p className="text-[13px] text-muted-foreground">
            {t.rich("pushEnvHint", {
              command: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        </div>
      )}
    </SettingsSection>
  )
}
