import { Button } from "@sniptide/ui/components/button"
import { Kbd } from "@sniptide/ui/components/kbd"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Switch } from "@sniptide/ui/components/switch"
import { ArrowLeftIcon } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { messages } from "../lib/messages"
import type { Account, Settings, State } from "../lib/protocol"
import { openTab } from "./app"
import { IconButton } from "./icon-button"
import { ask } from "./rpc"
import { visibilityOptions } from "./visibility"

export function SettingsView({
  account,
  settings,
  onState,
  onBack,
}: {
  account: Account
  settings: Settings
  onState: (state: State) => void
  onBack: () => void
}) {
  const [shortcut, setShortcut] = useState<string | null>(null)
  const visibilityId = useId()
  const sourceId = useId()

  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      setShortcut(commands.find((command) => command.name === "save-selection")?.shortcut || "")
    })
  }, [])

  const update = async (change: Partial<Settings>) =>
    onState(await ask({ type: "settings", settings: change }))

  return (
    <div>
      <header className="flex h-12 items-center gap-1 border-b px-2">
        <IconButton label={messages.back} onClick={onBack}>
          <ArrowLeftIcon />
        </IconButton>
        <h1 className="font-heading text-base font-bold tracking-[-0.02em]">{messages.settings}</h1>
      </header>
      <div className="flex flex-col gap-5 p-4">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm leading-5">
            <span className="block text-[13px] text-muted-foreground">{messages.signedInAs}</span>
            <span className="block truncate font-medium">{account.name || account.username}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {new URL(account.instance).host}
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => onState(await ask({ type: "signOut" }))}
          >
            {messages.signOut}
          </Button>
        </div>
        <div className="flex flex-col gap-2 border-t pt-5">
          <span id={visibilityId} className="text-sm leading-5">
            {messages.defaultVisibility}
          </span>
          <SegmentedControl
            aria-labelledby={visibilityId}
            value={settings.visibility}
            onValueChange={(visibility) => void update({ visibility })}
            options={visibilityOptions}
          />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor={sourceId} className="flex-1 text-sm leading-5">
            {messages.includeSource}
          </label>
          <Switch
            id={sourceId}
            checked={settings.includeSource}
            onCheckedChange={(includeSource) => void update({ includeSource })}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm leading-5">{messages.shortcut}</span>
          {shortcut === null ? null : shortcut ? (
            <Kbd>{shortcut}</Kbd>
          ) : (
            <span className="text-[13px] text-muted-foreground">{messages.shortcutUnset}</span>
          )}
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => openTab("chrome://extensions/shortcuts")}
          >
            {messages.changeShortcut}
          </Button>
        </div>
      </div>
    </div>
  )
}
