"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Switch } from "@sniptide/ui/components/switch"
import { KeyRoundIcon, TerminalIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { CopyButton } from "@/components/paste/copy-button"
import { createApiToken, deleteEnvGroup, revokeApiToken } from "@/lib/api/token-actions"
import type { TokenExpiry, TokenSummary } from "@/lib/api/tokens"
import type { EnvGroupSummary } from "@/lib/env/store"
import { formatDate, timeAgo } from "@/lib/format"
import { SaveStatus, SettingRow, SettingsSection } from "./section"

const expiryOptions: { value: TokenExpiry; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" },
]

function NewToken({ token, origin }: { token: string; origin: string }) {
  // The token goes in through stdin, so it stays out of shell history and process lists.
  const login = `sniptide login --token-stdin --base-url ${origin}`
  return (
    <div role="status" className="flex flex-col gap-3 border border-primary/40 bg-primary/5 p-4">
      <p className="text-sm font-medium">Copy your new token now</p>
      <p className="text-[13px] text-muted-foreground">
        It won't be shown again. Anyone with it can act as you within its scopes.
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate border border-border bg-background px-3 py-2 font-mono text-[13px]">
          {token}
        </code>
        <CopyButton text={token} variant="outline" size="lg" />
      </div>
      <p className="text-[13px] text-muted-foreground">
        For the CLI, pipe it into <code className="font-mono text-foreground">{login}</code>, or set
        it as <code className="font-mono text-foreground">SNIPTIDE_TOKEN</code>.
      </p>
    </div>
  )
}

export function ApiTokensSection({ tokens, origin }: { tokens: TokenSummary[]; origin: string }) {
  const router = useRouter()
  const [write, setWrite] = React.useState(true)
  const [expiry, setExpiry] = React.useState<TokenExpiry>("90d")
  const [created, setCreated] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title="API tokens"
      description="For the sniptide CLI, coding agents and scripts. A token acts as you: read lists and pulls your pastes and env groups, write also creates them."
    >
      <form
        className="flex flex-col gap-4 border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const name = String(new FormData(form).get("name") ?? "")
          setStatus(null)
          startTransition(async () => {
            const result = await createApiToken({ name, write, expiry })
            if (!result.ok) return setStatus({ ok: false, message: result.error })
            setCreated(result.token)
            form.reset()
            router.refresh()
          })
        }}
      >
        <Input
          name="name"
          required
          maxLength={60}
          aria-label="Token name"
          placeholder="Token name, like “laptop CLI”"
          className="h-10 text-base lg:text-sm"
        />
        <SettingRow
          id="token-write-label"
          label="Write access"
          description="Create pastes and push env groups. Off means read-only."
        >
          <Switch
            aria-labelledby="token-write-label"
            checked={write}
            onCheckedChange={(checked) => setWrite(checked)}
          />
        </SettingRow>
        <SettingRow id="token-expiry-label" label="Expires">
          <SegmentedControl
            aria-labelledby="token-expiry-label"
            value={expiry}
            onValueChange={setExpiry}
            options={expiryOptions}
            className="shrink-0"
            itemClassName="px-2 whitespace-nowrap"
          />
        </SettingRow>
        <Button type="submit" size="lg" disabled={pending} className="self-start">
          <KeyRoundIcon />
          {pending ? "Creating…" : "Create token"}
        </Button>
        <SaveStatus status={status} />
      </form>

      {created ? <NewToken token={created} origin={origin} /> : null}

      {tokens.length ? (
        <ul
          aria-label="Your API tokens"
          className="flex flex-col divide-y divide-border border border-border"
        >
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{token.name}</span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {token.prefix}… · {token.scopes.join(" + ")}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  Created {formatDate(token.createdAt)} ·{" "}
                  {token.lastUsedAt ? `used ${timeAgo(token.lastUsedAt)}` : "never used"}
                  {token.expiresAt ? ` · expires ${formatDate(token.expiresAt)}` : ""}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await revokeApiToken(token.id)
                    router.refresh()
                  })
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">No tokens yet.</p>
      )}
      <a
        href="/docs/api"
        className="text-[13px] text-foreground underline underline-offset-4 hover:text-primary"
      >
        API reference
      </a>
    </SettingsSection>
  )
}

export function EnvGroupsSection({ groups }: { groups: EnvGroupSummary[] }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title="Env groups"
      description="Environment variables you sync with sniptide env. Values are encrypted at rest and only shown to the CLI."
    >
      {groups.length ? (
        <ul
          aria-label="Your env groups"
          className="flex flex-col divide-y divide-border border border-border"
        >
          {groups.map((group) => (
            <li key={group.slug} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm">{group.slug}</span>
                <span className="text-[12px] text-muted-foreground">
                  {group.variables} variable{group.variables === 1 ? "" : "s"} · updated{" "}
                  {timeAgo(group.updatedAt)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteEnvGroup(group.slug)
                    router.refresh()
                  })
                }
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2 border border-dashed border-input p-5">
          <TerminalIcon className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">No env groups yet</p>
          <p className="text-[13px] text-muted-foreground">
            Push a project's .env with <code className="font-mono">sniptide env push my-app</code>,
            then pull it on another machine or run a command with it.
          </p>
        </div>
      )}
    </SettingsSection>
  )
}
