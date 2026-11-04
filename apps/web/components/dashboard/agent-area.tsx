"use client"

import { Button } from "@sniptide/ui/components/button"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Spinner } from "@sniptide/ui/components/spinner"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { ArrowRightIcon, XIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { NavigationLink as Link } from "@/components/navigation-link"
import { AgentLogo, CursorLogo } from "@/components/onboarding/agent-logos"
import { SetupCode } from "@/components/onboarding/agent-step"
import { getConnectedAgents } from "@/lib/agent-actions"
import type { ConnectedAgent } from "@/lib/agents"
import { track } from "@/lib/analytics"
import { timeAgo } from "@/lib/format"
import { AGENT_CLIENTS, type AgentClient, agentSetup } from "@/lib/onboarding"

// While the connect card waits for a first connection it asks every few seconds, for at most a
// quarter of an hour. Once agents are connected, their last activity refreshes once a minute and
// whenever the tab comes back into view.
const WAIT_POLL_MS = 2500
const WAIT_FOR_MS = 15 * 60_000
const ACTIVITY_POLL_MS = 60_000

function useAgents(initial: ConnectedAgent[], waiting: boolean) {
  const [agents, setAgents] = React.useState(initial)
  const connected = agents.length > 0

  React.useEffect(() => {
    if (!connected && !waiting) return
    let stopped = false
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout>
    let running = false

    async function refresh() {
      if (stopped || running) return
      if (!connected && Date.now() - started > WAIT_FOR_MS) return
      clearTimeout(timer)
      if (document.visibilityState === "visible") {
        running = true
        const next = await getConnectedAgents().catch(() => null)
        running = false
        if (stopped) return
        if (next && (connected || next.length > 0)) setAgents(next)
        // The first connection swaps the card, and the effect starts again for activity.
        if (!connected && next && next.length > 0) return
      }
      timer = setTimeout(refresh, connected ? ACTIVITY_POLL_MS : WAIT_POLL_MS)
    }

    function onVisible() {
      if (document.visibilityState === "visible") refresh()
    }

    timer = setTimeout(refresh, connected ? ACTIVITY_POLL_MS : 0)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [connected, waiting])

  return agents
}

// The dashboard's agent widget: a setup card until an agent connects, then the connected agents
// and when each last did something. Someone who doesn't use agents removes the widget.
export function AgentArea({
  agents: initial,
  origin,
  onRemove,
}: {
  agents: ConnectedAgent[]
  origin: string
  onRemove?: () => void
}) {
  // Polling starts once a setup was copied or opened, since only then can a connection appear.
  const [used, setUsed] = React.useState<AgentClient | null>(null)
  const agents = useAgents(initial, used !== null)
  const [justConnected, setJustConnected] = React.useState(false)

  React.useEffect(() => {
    if (used && agents.length > 0 && !justConnected) {
      setJustConnected(true)
      track("dashboard_agent_connected", { client: agents[0]?.client ?? "other" })
    }
  }, [agents, used, justConnected])

  const connectedMessage = useConnectedMessage()
  const first = agents[0]

  return (
    <>
      {/* Present from the start, so the confirmation is announced when the card swaps. */}
      <p aria-live="polite" className="sr-only">
        {justConnected && first ? connectedMessage(first.client) : null}
      </p>
      {first ? (
        <AgentStatus agents={agents} justConnected={justConnected ? first : undefined} />
      ) : (
        <ConnectCard
          origin={origin}
          used={used}
          onUse={(client) => {
            setUsed(client)
            track("agent_snippet_copied", { client, surface: "dashboard" })
          }}
          onRemove={onRemove}
        />
      )}
    </>
  )
}

function useConnectedMessage() {
  const t = useTranslations("Onboarding.agent")
  return (client: AgentClient) =>
    client === "other" ? t("connectedOther") : t("connected", { client: t(`clients.${client}`) })
}

function ConnectCard({
  origin,
  used,
  onUse,
  onRemove,
}: {
  origin: string
  used: AgentClient | null
  onUse: (client: AgentClient) => void
  onRemove?: () => void
}) {
  const t = useTranslations("Onboarding.agent")
  const tWorkspace = useTranslations("Workspace")
  const [client, setClient] = React.useState<AgentClient>("claude_code")
  const setup = agentSetup(origin)
  const label = (value: AgentClient) => t(`clients.${value}`)

  return (
    <section
      aria-labelledby="agent-heading"
      className="flex flex-col gap-4 rounded-lg border border-border p-4 lg:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="agent-heading" className="text-[15px] font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm leading-5 text-muted-foreground">{t("subtitle")}</p>
        </div>
        {onRemove ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tWorkspace("widget_remove_named", { name: tWorkspace("widget_agents") })}
            className="-mt-1 -mr-1 shrink-0 max-lg:size-10"
            onClick={onRemove}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>

      <SegmentedControl
        aria-label={t("clientLabel")}
        value={client}
        onValueChange={setClient}
        options={AGENT_CLIENTS.map((value) => ({
          value,
          label: (
            <span className="flex items-center justify-center gap-1.5">
              <AgentLogo client={value} className="size-3.5" />
              {label(value)}
            </span>
          ),
        }))}
        // Two rows on phones, so every client keeps its logo and full name.
        className="grid w-full grid-cols-2 sm:flex sm:w-auto sm:self-start"
        itemClassName="whitespace-nowrap px-2 py-[9px] sm:px-3 lg:py-[5px]"
      />

      <div key={client} className="flex flex-col gap-3">
        {client === "cursor" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              size="lg"
              className="self-start"
              nativeButton={false}
              render={<a href={setup.cursorLink} onClick={() => onUse("cursor")} />}
            >
              <CursorLogo />
              {t("addToCursor")}
            </Button>
            <p className="text-sm leading-5 text-muted-foreground">{t("cursorHint")}</p>
          </div>
        ) : (
          <>
            <p className="text-sm leading-5 text-muted-foreground">
              {t(
                client === "other"
                  ? "otherHint"
                  : client === "claude_code"
                    ? "claudeCodeHint"
                    : "terminalHint",
                { client: label(client) },
              )}
            </p>
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
          </>
        )}
      </div>

      {used ? (
        <p
          role="status"
          className="flex min-h-5 items-center gap-2 text-sm leading-5 text-muted-foreground"
        >
          <Spinner />
          {t("waiting", { client: used === "other" ? t("yourAgent") : label(used) })}
        </p>
      ) : null}
    </section>
  )
}

function AgentStatus({
  agents,
  justConnected,
}: {
  agents: ConnectedAgent[]
  justConnected?: ConnectedAgent
}) {
  const t = useTranslations("Workspace")
  const connectedMessage = useConnectedMessage()
  const locale = useLocale()
  return (
    <section
      aria-labelledby="agents-heading"
      className="flex flex-col overflow-hidden rounded-lg border border-border"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="agents-heading" className="text-[15px] font-semibold">
          {t("agents_connected")}
        </h2>
        <Link
          href="/settings?tab=api"
          className="flex min-h-10 items-center gap-1 text-sm font-medium hover:text-link lg:min-h-0 lg:text-[13px]"
        >
          {t("agents_manage")}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      {justConnected ? (
        <p className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm leading-5">
          <SuccessCheck className="text-highlight" />
          {connectedMessage(justConnected.client)}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {agents.map((agent) => {
          return (
            <li
              key={agent.name}
              className="flex min-h-12 items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
            >
              <AgentLogo client={agent.client} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
              <span
                className="shrink-0 text-[13px] text-muted-foreground tabular-nums"
                suppressHydrationWarning
              >
                {agent.lastActiveAt
                  ? t("agent_active", { time: timeAgo(agent.lastActiveAt, Date.now(), locale) })
                  : t("agent_not_used_yet")}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
