"use client"

import { Button } from "@sniptide/ui/components/button"
import { Spinner } from "@sniptide/ui/components/spinner"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "@sniptide/ui/lib/utils"
import { ArrowLeftIcon, GlobeIcon, PlugIcon, SquareSlashIcon, TerminalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { CopyButton } from "@/components/paste/copy-button"
import { track } from "@/lib/analytics"
import { AGENT_CLIENTS, type AgentClient, agentSetup } from "@/lib/onboarding"
import { getAgentConnection } from "@/lib/onboarding-actions"
import { AgentLogo, CursorLogo } from "./agent-logos"

// How often the step asks whether an agent has connected, and for how long.
const POLL_MS = 2500
const POLL_FOR_MS = 15 * 60_000

// Watches for the account's first OAuth connection while the step is open. Running the command
// opens Sniptide's consent screen in another tab, so allowing it there is all it takes: this tab
// sees the new connection and confirms it without a reload.
function useAgentConnection() {
  const [connected, setConnected] = React.useState<AgentClient | null>(null)

  React.useEffect(() => {
    if (connected) return
    let stopped = false
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      if (stopped || Date.now() - started > POLL_FOR_MS) return
      if (document.visibilityState === "visible") {
        const result = await getAgentConnection().catch(() => null)
        if (stopped) return
        if (result) return setConnected(result.client)
      }
      timer = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [connected])

  return connected
}

export function AgentStep({
  origin,
  heading,
  client,
  onClientChange,
  onSetupUsed,
  onBack,
  onFinish,
}: {
  origin: string
  heading: React.ReactNode
  client: AgentClient
  onClientChange: (client: AgentClient) => void
  onSetupUsed: (client: AgentClient) => void
  onBack: () => void
  onFinish: (connected: AgentClient | null) => void
}) {
  const t = useTranslations("Onboarding.agent")
  const tWizard = useTranslations("Onboarding")
  // The client whose setup was copied or opened last, which is the one the step waits for.
  const [used, setUsed] = React.useState<AgentClient | null>(null)
  const connected = useAgentConnection()

  React.useEffect(() => {
    if (connected) track("onboarding_agent_connected", { client: connected })
  }, [connected])

  function use(which: AgentClient) {
    setUsed(which)
    onSetupUsed(which)
  }

  const label = (value: AgentClient) => t(`clients.${value}`)

  return (
    <section aria-labelledby="onboarding-title" className="flex flex-col gap-6">
      {heading}

      <fieldset aria-label={t("clientLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AGENT_CLIENTS.map((value) => {
          return (
            <label
              key={value}
              className={cn(
                "rounded-lg flex h-[76px] min-w-0 cursor-pointer flex-col items-center justify-center gap-2 border border-border bg-background px-2 text-[13px] leading-[18px] font-medium transition-colors hover:bg-muted",
                "has-checked:border-primary has-checked:bg-muted has-checked:ring-1 has-checked:ring-primary",
                "has-focus-visible:ring-3 has-focus-visible:ring-ring/30",
              )}
            >
              <input
                type="radio"
                name="agent_client"
                value={value}
                checked={client === value}
                onChange={() => onClientChange(value)}
                className="sr-only"
              />
              <AgentLogo client={value} className="size-5" />
              <span className="max-w-full truncate">{label(value)}</span>
            </label>
          )
        })}
      </fieldset>

      <AgentSetupSteps key={client} client={client} origin={origin} onUse={use} />

      <p
        aria-live="polite"
        className={cn(
          "flex min-h-5 items-center gap-2 text-sm leading-5",
          connected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {connected ? (
          <>
            <SuccessCheck className="text-highlight" />
            {connected === "other"
              ? t("connectedOther")
              : t("connected", { client: label(connected) })}
          </>
        ) : used ? (
          <>
            <Spinner />
            {t("waiting", { client: used === "other" ? t("yourAgent") : label(used) })}
          </>
        ) : null}
      </p>

      <div className="flex items-center gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:min-h-14 max-lg:border-t max-lg:border-border max-lg:bg-background max-lg:px-4 max-lg:pt-2 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" size="lg" className="max-lg:h-10" onClick={onBack}>
          <ArrowLeftIcon />
          {tWizard("back")}
        </Button>
        <Button
          variant={connected ? "default" : "ghost"}
          size="lg"
          className={cn("ml-auto", connected ? "max-lg:h-[38px]" : "max-lg:h-10")}
          onClick={() => onFinish(connected)}
        >
          {connected ? t("finish") : t("skipForNow")}
        </Button>
      </div>
    </section>
  )
}

// The steps for one client, each a line with an icon. The command or address to copy sits under
// the step that uses it.
export function AgentSetupSteps({
  client,
  origin,
  onUse,
}: {
  client: AgentClient
  origin: string
  onUse: (client: AgentClient) => void
}) {
  const t = useTranslations("Onboarding.agent.steps")
  const setup = agentSetup(origin)
  const code = (chunks: React.ReactNode) => (
    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[13px]">{chunks}</code>
  )
  const allow = <Step icon={GlobeIcon} label={t("allow")} />

  return (
    <ol className="flex flex-col gap-3">
      {client === "cursor" ? (
        <li>
          <Button
            size="lg"
            nativeButton={false}
            render={<a href={setup.cursorLink} onClick={() => onUse("cursor")} />}
          >
            <CursorLogo />
            {t("addToCursor")}
          </Button>
        </li>
      ) : (
        <Step
          icon={client === "other" ? PlugIcon : TerminalIcon}
          label={t(client === "other" ? "addServer" : "run")}
        >
          <SetupCode
            code={
              client === "claude_code"
                ? setup.claudeCode
                : client === "codex"
                  ? setup.codex
                  : setup.url
            }
            onCopy={() => onUse(client)}
          />
        </Step>
      )}
      {client === "claude_code" ? (
        <Step icon={SquareSlashIcon} label={t.rich("authenticate", { code })} />
      ) : null}
      {allow}
    </ol>
  )
}

function Step({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <li className="flex min-w-0 gap-3 text-sm leading-5">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span>{label}</span>
        {children}
      </div>
    </li>
  )
}

// A command or address in mono with its copy button. The text wraps at spaces, so the whole
// command stays readable on a phone.
export function SetupCode({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="rounded-lg flex min-w-0 flex-col gap-3 border border-border bg-muted p-3 sm:flex-row sm:items-center sm:py-2 sm:pr-2">
      <code className="min-w-0 flex-1 font-mono text-[13px] leading-5 [overflow-wrap:anywhere]">
        {code}
      </code>
      <CopyButton variant="default" text={code} onClickCapture={onCopy} />
    </div>
  )
}
