import type { PasteSummary } from "@sniptide/sdk"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Spinner } from "@sniptide/ui/components/spinner"
import { toast } from "@sniptide/ui/components/toast"
import { ExternalLinkIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { messages } from "../lib/messages"
import { relativeTime } from "../lib/time"
import { openTab } from "./app"
import { IconButton } from "./icon-button"
import { ask, errorMessage } from "./rpc"

export function Recent() {
  const [query, setQuery] = useState("")
  const [pastes, setPastes] = useState<PasteSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    // Wait for a pause in typing before asking; the first load asks at once.
    const timer = setTimeout(
      () => {
        ask({ type: "recent", query })
          .then((result) => {
            if (!current) return
            setPastes(result)
            setError(null)
          })
          .catch((cause: unknown) => {
            if (current) setError(errorMessage(cause, messages.unexpected))
          })
      },
      query ? 200 : 0,
    )
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  async function copy(paste: PasteSummary) {
    try {
      await navigator.clipboard.writeText(paste.url)
      toast.success(messages.copied)
    } catch {
      toast.error(messages.copyFailed)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <Input
        type="search"
        aria-label={messages.searchPlaceholder}
        placeholder={messages.searchPlaceholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-9"
      />
      <FormError message={error} />
      {pastes === null && !error ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          <Spinner label={messages.tabRecent} />
        </div>
      ) : null}
      {pastes?.length === 0 ? (
        <p className="py-6 text-center text-sm leading-5 text-muted-foreground">
          {query.trim() ? messages.noMatches : messages.noPastes}
        </p>
      ) : null}
      {pastes?.length ? (
        <ul className="scrollbar-subtle -mx-2 max-h-80 overflow-y-auto">
          {pastes.map((paste) => (
            <li key={paste.id} className="group flex items-center rounded-md hover:bg-muted">
              <button
                type="button"
                aria-label={messages.copyLinkTo(paste.title)}
                title={messages.copyLink}
                onClick={() => void copy(paste)}
                className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="block truncate text-sm leading-5">{paste.title}</span>
                <span className="block truncate text-xs leading-4 text-muted-foreground">
                  <span className="font-mono">{paste.slug}</span>
                  {" · "}
                  {messages[paste.visibility]}
                  {" · "}
                  {relativeTime(paste.updatedAt)}
                </span>
              </button>
              <IconButton
                label={messages.openInNewTab(paste.title)}
                onClick={() => openTab(paste.url)}
                className="mr-1 text-muted-foreground"
              >
                <ExternalLinkIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
