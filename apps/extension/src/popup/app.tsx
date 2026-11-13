import { Logo } from "@sniptide/ui/components/logo"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@sniptide/ui/components/tabs"
import { Toaster } from "@sniptide/ui/components/toast"
import { ExternalLinkIcon, SettingsIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { messages } from "../lib/messages"
import type { State } from "../lib/protocol"
import { Compose } from "./compose"
import { IconButton } from "./icon-button"
import { Recent } from "./recent"
import { ask } from "./rpc"
import { SettingsView } from "./settings"
import { SignIn } from "./sign-in"

export function App() {
  const [state, setState] = useState<State | null>(null)
  const [view, setView] = useState<"main" | "settings">("main")
  const [tab, setTab] = useState<"new" | "recent">("new")

  useEffect(() => {
    void ask({ type: "state" }).then(setState)
  }, [])

  // The worker answers within a frame, so an empty popup of the right width avoids a flash.
  if (!state) return <div className="h-40" />
  const { account, settings } = state
  if (!account) return <SignIn onState={setState} />
  if (view === "settings")
    return (
      <SettingsView
        account={account}
        settings={settings}
        onState={setState}
        onBack={() => setView("main")}
      />
    )

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <header className="flex h-12 items-center gap-1 border-b pr-2 pl-4">
        <h1 className="mr-auto">
          <Logo className="[&>svg]:h-5 [&>svg]:w-auto [&_span_svg]:w-[104px]" />
        </h1>
        <IconButton label={messages.openApp} onClick={() => openTab(account.instance)}>
          <ExternalLinkIcon />
        </IconButton>
        <IconButton label={messages.settings} onClick={() => setView("settings")}>
          <SettingsIcon />
        </IconButton>
      </header>
      <TabsList className="px-4 pt-3">
        <TabsTab value="new">{messages.tabNew}</TabsTab>
        <TabsTab value="recent">{messages.tabRecent}</TabsTab>
      </TabsList>
      <TabsPanel value="new" keepMounted className="data-hidden:hidden">
        <Compose settings={settings} />
      </TabsPanel>
      <TabsPanel value="recent">
        <Recent />
      </TabsPanel>
      <Toaster className="top-auto bottom-3 lg:right-0 lg:w-auto" dismissLabel={messages.dismiss} />
    </Tabs>
  )
}

export function openTab(url: string) {
  void chrome.tabs.create({ url })
}
