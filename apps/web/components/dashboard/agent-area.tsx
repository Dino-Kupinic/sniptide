"use client"

import { Button } from "@sniptide/ui/components/button"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Spinner } from "@sniptide/ui/components/spinner"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "@sniptide/ui/lib/utils"
import { ArrowRightIcon, PlusIcon, XIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { NavigationLink as Link } from "@/components/navigation-link"
import { AgentLogo } from "@/components/onboarding/agent-logos"
import { AgentSetupSteps } from "@/components/onboarding/agent-step"
import { getConnectedAgents } from "@/lib/agent-actions"
import type { ConnectedAgent } from "@/lib/agents"
import { track } from "@/lib/analytics"
import { timeAgo } from "@/lib/format"
import { AGENT_CLIENTS, type AgentClient } from "@/lib/onboarding"

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
    const fast = () => waiting && Date.now() - started < WAIT_FOR_MS

    async function refresh() {
      if (stopped || running) return
      if (!connected && !fast()) return
      clearTimeout(timer)
      if (document.visibilityState === "visible") {
        running = true
        const next = await getConnectedAgents().catch(() => null)
        running = false
        if (stopped) return
        if (next && (connected || next.length > 0)) setAgents(next)
      }
      timer = setTimeout(refresh, fast() ? WAIT_POLL_MS : ACTIVITY_POLL_MS)
    }

    function onVisible() {
      if (document.visibilityState === "visible") refresh()
    }

    timer = setTimeout(refresh, waiting ? 0 : ACTIVITY_POLL_MS)
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
// and when each last did something, with the setup one click away for the next agent. Someone who doesn't use agents removes the widget.
export function AgentArea({
  agents: initial,
  origin,
  onRemove,
}: {
  agents: ConnectedAgent[]
  origin: string
  onRemove?: () => void
}) {
  // Polling speeds up once a setup was copied or opened, since only then can a connection appear.
  const [used, setUsed] = React.useState<AgentClient | null>(null)
  const agents = useAgents(initial, used !== null)
  // The agents known when the setup was used, so a new one stands out from the rest.
  const known = React.useRef(new Set(initial.map((agent) => agent.name)))
  const [justConnected, setJustConnected] = React.useState<ConnectedAgent | null>(null)
  const [adding, setAdding] = React.useState(false)

  React.useEffect(() => {
    if (!used) return
    const added = agents.find((agent) => !known.current.has(agent.name))
    if (!added) return
    known.current = new Set(agents.map((agent) => agent.name))
    setJustConnected(added)
    setUsed(null)
    setAdding(false)
    track("dashboard_agent_connected", { client: added.client })
  }, [agents, used])

  const connectedMessage = useConnectedMessage()

  function onUse(client: AgentClient) {
    known.current = new Set(agents.map((agent) => agent.name))
    setUsed(client)
    track("agent_snippet_copied", { client, surface: "dashboard" })
  }

  return (
    <>
      {/* Present from the start, so the confirmation is announced when the card swaps. */}
      <p aria-live="polite" className="sr-only">
        {justConnected ? connectedMessage(justConnected.client) : null}
      </p>
      {agents.length > 0 ? (
        <AgentStatus
          agents={agents}
          justConnected={justConnected ?? undefined}
          adding={adding}
          onAddingChange={setAdding}
        >
          <ConnectSteps origin={origin} used={used} onUse={onUse} />
        </AgentStatus>
      ) : (
        <ConnectCard origin={origin} used={used} onUse={onUse} onRemove={onRemove} />
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
      <ConnectSteps origin={origin} used={used} onUse={onUse} />
    </section>
  )
}

// The client picker and its setup steps, shared by the first connection and "Connect another".
function ConnectSteps({
  origin,
  used,
  onUse,
}: {
  origin: string
  used: AgentClient | null
  onUse: (client: AgentClient) => void
}) {
  const t = useTranslations("Onboarding.agent")
  const [client, setClient] = React.useState<AgentClient>("claude_code")
  const label = (value: AgentClient) => t(`clients.${value}`)

  return (
    <div className="flex flex-col gap-4">
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
        // Two rows in narrow widgets, so every client keeps its logo and full name.
        className="grid w-full grid-cols-2 @3xl/widget:flex @3xl/widget:w-auto @3xl/widget:self-start"
        itemClassName="whitespace-nowrap px-2 py-[9px] @3xl/widget:px-3 lg:py-[5px]"
      />

      <AgentSetupSteps key={client} client={client} origin={origin} onUse={onUse} />

      {used ? (
        <p
          role="status"
          className="flex min-h-5 items-center gap-2 text-sm leading-5 text-muted-foreground"
        >
          <Spinner />
          {t("waiting", { client: used === "other" ? t("yourAgent") : label(used) })}
        </p>
      ) : null}
    </div>
  )
}

function AgentStatus({
  agents,
  justConnected,
  adding,
  onAddingChange,
  children,
}: {
  agents: ConnectedAgent[]
  justConnected?: ConnectedAgent
  adding: boolean
  onAddingChange: (adding: boolean) => void
  children: React.ReactNode
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
      {adding ? (
        <div id="agents-connect" className="border-t border-border p-4">
          {children}
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={adding}
        aria-controls="agents-connect"
        onClick={() => onAddingChange(!adding)}
        className="flex min-h-12 items-center gap-3 border-t border-border px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none lg:min-h-11"
      >
        <PlusIcon
          aria-hidden
          className={cn(
            "size-4 transition-transform motion-reduce:transition-none",
            adding && "rotate-45",
          )}
        />
        {t("agents_connect_another")}
      </button>
    </section>
  )
}
