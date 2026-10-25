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
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { ChevronDownIcon, ClockIcon, LinkIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { z } from "zod"
import { HighlightedTextarea } from "@/components/paste/highlighted-textarea"
import { LanguageIcon } from "@/components/paste/language-icon"
import { LanguagePicker } from "@/components/paste/language-picker"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { useHighlight } from "@/lib/highlight/use-highlight"
import { savePaste } from "@/lib/pastes/actions"
import { detectLanguage, getLanguage, renameForLanguage } from "@/lib/pastes/languages"
import { EXPIRIES, type Expiry, VISIBILITIES, type Visibility } from "@/lib/pastes/types"
import { matchesCombo, shortcut } from "@/lib/shortcuts"

const LEGACY_DRAFT_KEY = "sniptide:quick-paste"

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

const draftSchema = z.object({
  name: z.string(),
  content: z.string(),
  expiry: z.enum(EXPIRIES),
  visibility: z.enum(VISIBILITIES),
  burnAfterRead: z.boolean(),
})

// Browser storage is only a convenience here: a lost draft costs a re-paste, nothing more.
function readDraft(key: string, fallback: Draft): Draft {
  try {
    window.localStorage.removeItem(LEGACY_DRAFT_KEY)
    const stored = window.localStorage.getItem(key)
    const parsed = stored ? draftSchema.safeParse(JSON.parse(stored)) : null
    return parsed?.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(key, JSON.stringify(draft))
    else window.localStorage.removeItem(key)
  } catch {
    // Private mode or blocked storage: the draft just isn't kept.
  }
}

const chipClass =
  "flex h-[30px] shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 shadow-[0_2px_0_0_var(--border)] dark:bg-card dark:shadow-[0_2px_0_0_color-mix(in_oklch,var(--border),var(--foreground)_22%)] text-[13px] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground/40 [&_svg]:size-3.5"

function Chip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <DropdownMenuTrigger className={chipClass}>
      {/* The field's name, for screen readers, ahead of the visible value. An aria-label would
          hide the value from voice control, which matches on the words a button shows. */}
      <span className="sr-only">{label}</span>
      {children}
      <ChevronDownIcon className="text-muted-foreground" />
    </DropdownMenuTrigger>
  )
}

// "Quick paste" composer on the dashboard: one file, the common options, Cmd+Enter to create.
export function QuickPaste({
  defaults,
  draftScope,
}: {
  draftScope: string
  // Paste defaults from Settings, used for a fresh draft.
  defaults?: Pick<Draft, "expiry" | "visibility" | "burnAfterRead">
}) {
  const t = useTranslations("Workspace")
  const expiryLabels: Record<Expiry, string> = {
    "1h": t("1_hour"),
    "1d": t("1_day"),
    "1w": t("1_week"),
    "1m": t("1_month"),
    "1y": t("1_year"),
    never: t("never"),
  }
  const visibilityLabels: Record<Visibility, string> = {
    private: t("private"),
    unlisted: t("unlisted"),
    public: t("public"),
  }

  const router = useRouter()
  const draftKey = `sniptide:quick-paste:${encodeURIComponent(draftScope)}`
  const fresh = React.useMemo(() => ({ ...emptyDraft, ...defaults }), [defaults])
  const [draft, setDraft] = React.useState<Draft>(fresh)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const loaded = React.useRef(false)
  const completed = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const language = detectLanguage(draft.name)
  const highlighted = useHighlight(draft.content, draft.name)

  React.useEffect(() => {
    setDraft(readDraft(draftKey, fresh))
    loaded.current = true
  }, [draftKey, fresh])

  React.useEffect(() => {
    if (!loaded.current || completed.current) return
    setSaved(false)
    timer.current = setTimeout(() => {
      writeDraft(draftKey, draft)
      setSaved(Boolean(draft.content))
    }, 500)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [draft, draftKey])

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function setLanguage(id: string) {
    update({ name: renameForLanguage(draft.name || "snippet", getLanguage(id)) })
  }

  // ⌘S: write the draft now instead of waiting out the half-second delay.
  function saveDraft() {
    if (completed.current) return
    if (timer.current) clearTimeout(timer.current)
    writeDraft(draftKey, draft)
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
      completed.current = true
      if (timer.current) clearTimeout(timer.current)
      writeDraft(draftKey, null)
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
        <h2 id="quick-paste-heading" className="text-sm font-semibold">
          {t("quick_paste")}
        </h2>
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

      {/* A fixed height that scrolls inside, so a long or wide paste never stretches the card. */}
      <div className="flex min-h-0 flex-1 bg-sidebar/60 px-4 py-3.5 font-mono text-[13px] leading-[21px]">
        <HighlightedTextarea
          aria-label={t("code")}
          lines={highlighted}
          value={draft.content}
          onChange={(event) => update({ content: event.target.value })}
          placeholder={t("paste_code_here")}
          spellCheck={false}
          wrap="off"
          rows={12}
          metricsClassName="leading-[21px]"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <LanguagePicker
            value={language.id}
            onValueChange={setLanguage}
            aria-label={t("language")}
            className={chipClass}
          >
            <LanguageIcon language={language.id} className="size-3.5" />
            {language.name}
            <ChevronDownIcon className="text-muted-foreground" />
          </LanguagePicker>
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
        </div>
        <Button
          variant="inverted"
          size="lg"
          loading={pending}
          onClick={create}
          className="h-[30px] gap-2 text-[13px]"
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
