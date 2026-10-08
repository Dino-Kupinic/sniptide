"use client"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDownIcon, ClockIcon, LinkIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { LanguageMarker } from "@/components/paste/language-marker"
import { savePaste } from "@/lib/pastes/actions"
import { detectLanguage, languages } from "@/lib/pastes/languages"
import type { Expiry, Visibility } from "@/lib/pastes/types"

const DRAFT_KEY = "sniptide:quick-paste"

interface Draft {
  name: string
  content: string
  expiry: Expiry
  visibility: Visibility
  burnAfterRead: boolean
}

const emptyDraft: Draft = {
  name: "snippet.ts",
  content: "",
  expiry: "1w",
  visibility: "unlisted",
  burnAfterRead: false,
}

const expiryLabels: Record<Expiry, string> = {
  "1h": "1 hour",
  "1d": "1 day",
  "1w": "1 week",
  "1m": "1 month",
  never: "Never",
}
const visibilityLabels: Record<Visibility, string> = {
  private: "Private",
  unlisted: "Unlisted",
  public: "Public",
}

// Browser storage is only a convenience here: a lost draft costs a re-paste, nothing more.
function readDraft(fallback: Draft): Draft {
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY)
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback
  } catch {
    return fallback
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Private mode or blocked storage: the draft just isn't kept.
  }
}

function Chip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <DropdownMenuTrigger
      aria-label={label}
      className="flex h-8 shrink-0 items-center gap-1.5 border border-border px-2.5 text-[13px] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground [&_svg]:size-3.5"
    >
      {children}
      <ChevronDownIcon className="text-muted-foreground" />
    </DropdownMenuTrigger>
  )
}

// "Quick paste" composer on the dashboard: one file, the common options, Cmd+Enter to create.
export function QuickPaste({
  defaults,
}: {
  // Paste defaults from Settings, used for a fresh draft.
  defaults?: Pick<Draft, "expiry" | "visibility" | "burnAfterRead">
}) {
  const router = useRouter()
  const fresh = React.useMemo(() => ({ ...emptyDraft, ...defaults }), [defaults])
  const [draft, setDraft] = React.useState<Draft>(fresh)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const loaded = React.useRef(false)
  const language = detectLanguage(draft.name)
  const lines = draft.content.split("\n").length

  React.useEffect(() => {
    setDraft(readDraft(fresh))
    loaded.current = true
  }, [fresh])

  React.useEffect(() => {
    if (!loaded.current) return
    setSaved(false)
    const timer = setTimeout(() => {
      writeDraft(draft)
      setSaved(Boolean(draft.content))
    }, 500)
    return () => clearTimeout(timer)
  }, [draft])

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function setLanguage(id: string) {
    const extension = languages.find((candidate) => candidate.id === id)?.extensions[0] ?? "txt"
    const base = draft.name.includes(".")
      ? draft.name.slice(0, draft.name.lastIndexOf("."))
      : draft.name
    update({ name: `${base || "snippet"}.${extension}` })
  }

  function create() {
    setError(null)
    startTransition(async () => {
      const result = await savePaste({
        title: draft.name,
        description: "",
        files: [{ name: draft.name, content: draft.content }],
        visibility: draft.visibility,
        expiry: draft.expiry,
        slug: "",
        collection: null,
        password: null,
        burnAfterRead: draft.burnAfterRead,
      })
      if (!result.ok) return setError(result.error)
      writeDraft(null)
      router.push(`/pastes/${result.slug}`)
    })
  }

  return (
    <section
      aria-labelledby="quick-paste-heading"
      className="flex min-w-0 flex-[1.8] flex-col border border-border"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          create()
        }
      }}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pr-3 pl-4">
        <div className="flex items-center gap-2.5">
          <h2 id="quick-paste-heading" className="text-sm font-semibold">
            Quick paste
          </h2>
          <input
            aria-label="File name"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            spellCheck={false}
            className="w-32 bg-muted px-2 py-[3px] font-mono text-xs text-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        <span
          aria-live="polite"
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground",
            !saved && "invisible",
          )}
        >
          Draft saved
          <span className="size-1.5 bg-primary" />
        </span>
      </div>

      <div className="flex flex-1 gap-4 bg-sidebar/60 px-4 py-3.5 font-mono text-[13px] leading-[21px]">
        <div
          aria-hidden="true"
          className="shrink-0 text-right text-muted-foreground/60 select-none"
        >
          {Array.from({ length: Math.max(lines, 12) }, (_, index) => (
            <div key={index} className={index >= lines ? "invisible" : undefined}>
              {index + 1}
            </div>
          ))}
        </div>
        <textarea
          aria-label="Code"
          value={draft.content}
          onChange={(event) => update({ content: event.target.value })}
          placeholder="Paste code here…"
          spellCheck={false}
          wrap="off"
          rows={Math.max(lines, 12)}
          className="min-w-0 flex-1 resize-none bg-transparent leading-[21px] whitespace-pre caret-primary outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <Chip label="Language">
              <LanguageMarker language={language.id} />
              {language.name}
            </Chip>
            <DropdownMenuContent className="max-h-72 overflow-y-auto">
              <DropdownMenuRadioGroup
                value={language.id}
                onValueChange={(id) => setLanguage(id as string)}
              >
                {languages.map((candidate) => (
                  <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <Chip label="Expires after">
              <ClockIcon />
              {expiryLabels[draft.expiry]}
            </Chip>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={draft.expiry}
                onValueChange={(expiry) => update({ expiry: expiry as Expiry })}
              >
                {(Object.keys(expiryLabels) as Expiry[]).map((expiry) => (
                  <DropdownMenuRadioItem key={expiry} value={expiry}>
                    {expiryLabels[expiry]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <Chip label="Visibility">
              <LinkIcon />
              {visibilityLabels[draft.visibility]}
            </Chip>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={draft.visibility}
                onValueChange={(visibility) => update({ visibility: visibility as Visibility })}
              >
                {(Object.keys(visibilityLabels) as Visibility[]).map((visibility) => (
                  <DropdownMenuRadioItem key={visibility} value={visibility}>
                    {visibilityLabels[visibility]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex items-center gap-2 px-2 text-[13px] text-foreground/80">
            <Switch
              aria-labelledby="quick-burn"
              checked={draft.burnAfterRead}
              onCheckedChange={(burnAfterRead) => update({ burnAfterRead })}
            />
            <span id="quick-burn">Burn after read</span>
          </span>
        </div>
        <Button
          variant="inverted"
          size="lg"
          disabled={pending}
          onClick={create}
          className="h-8 gap-2 text-[13px]"
        >
          {pending ? "Creating…" : "Create paste"}
          <span className="font-mono text-[11px] text-background/70">⌘↵</span>
        </Button>
      </div>
      {error ? (
        <p role="alert" className="border-t border-border px-4 py-2 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
