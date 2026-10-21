"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { FormError } from "@sniptide/ui/components/form-error"
import { Switch } from "@sniptide/ui/components/switch"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { ChevronDownIcon, ClockIcon, LinkIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { HighlightedTextarea } from "@/components/paste/highlighted-textarea"
import { LanguageMarker } from "@/components/paste/language-marker"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { useHighlight } from "@/lib/highlight/use-highlight"
import { savePaste } from "@/lib/pastes/actions"
import { detectLanguage, languages } from "@/lib/pastes/languages"
import type { Expiry, Visibility } from "@/lib/pastes/types"
import { matchesCombo, shortcut } from "@/lib/shortcuts"

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
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 shadow-[0_3px_0_0_var(--border)] dark:bg-card dark:shadow-[0_3px_0_0_color-mix(in_oklch,var(--border),var(--foreground)_22%)] text-[13px] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground/40 [&_svg]:size-3.5"
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
  const t = useTranslations("Workspace")
  const expiryLabels: Record<Expiry, string> = {
    "1h": t("1_hour"),
    "1d": t("1_day"),
    "1w": t("1_week"),
    "1m": t("1_month"),
    never: t("never"),
  }
  const visibilityLabels: Record<Visibility, string> = {
    private: t("private"),
    unlisted: t("unlisted"),
    public: t("public"),
  }

  const router = useRouter()
  const fresh = React.useMemo(() => ({ ...emptyDraft, ...defaults }), [defaults])
  const [draft, setDraft] = React.useState<Draft>(fresh)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const loaded = React.useRef(false)
  const language = detectLanguage(draft.name)
  const lines = draft.content.split("\n").length
  const highlighted = useHighlight(draft.content, draft.name)

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

  // ⌘S: write the draft now instead of waiting out the half-second delay.
  function saveDraft() {
    writeDraft(draft)
    setSaved(Boolean(draft.content))
  }

  function create() {
    if (pending) return
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
      }).catch(() => null)
      if (!result) return setError(t("couldnt_create_the_paste_try_again"))
      if (!result.ok) return setError(result.error)
      writeDraft(null)
      toast.success(t("paste_created"))
      router.push(`/pastes/${result.slug}`)
    })
  }

  return (
    <section
      aria-labelledby="quick-paste-heading"
      className="flex min-w-0 flex-[1.8] flex-col overflow-hidden rounded-lg border border-border"
      onKeyDown={(event) => {
        if (matchesCombo(event, shortcut("submit").keys)) {
          event.preventDefault()
          create()
        } else if (matchesCombo(event, shortcut("save").keys)) {
          // Without this the browser offers to save the page.
          event.preventDefault()
          saveDraft()
        }
      }}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pr-3 pl-4">
        <div className="flex items-center gap-2.5">
          <h2 id="quick-paste-heading" className="text-sm font-semibold">
            {t("quick_paste")}
          </h2>
          <input
            aria-label={t("file_name")}
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
          {t("draft_saved")}
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
        <HighlightedTextarea
          aria-label={t("code")}
          lines={highlighted}
          value={draft.content}
          onChange={(event) => update({ content: event.target.value })}
          placeholder={t("paste_code_here")}
          spellCheck={false}
          wrap="off"
          rows={Math.max(lines, 12)}
          metricsClassName="leading-[21px]"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <Chip label={t("language")}>
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
            <Chip label={t("expires_after")}>
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
            <Chip label={t("visibility")}>
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
            <span id="quick-burn">{t("burn_after_read")}</span>
          </span>
        </div>
        <Button
          variant="inverted"
          size="lg"
          loading={pending}
          onClick={create}
          className="h-8 gap-2 text-[13px]"
        >
          {pending ? t("creating") : t("create_paste")}
          <ShortcutKeys
            id="submit"
            className="h-auto min-w-0 bg-transparent px-0 text-background/70"
          />
        </Button>
      </div>
      <FormError variant="inline" message={error} className="border-t border-border px-4 py-2" />
    </section>
  )
}
