"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Kbd } from "@sniptide/ui/components/kbd"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { Switch } from "@sniptide/ui/components/switch"
import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, EyeIcon, EyeOffIcon, PlusIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { CodeBlock } from "@/components/paste/code-block"
import { HighlightedTextarea } from "@/components/paste/highlighted-textarea"
import { LanguageMarker } from "@/components/paste/language-marker"
import { useSiteHost } from "@/components/site-host"
import type { Collection } from "@/lib/collections/types"
import { byteLength, formatBytes } from "@/lib/format"
import { useHighlight } from "@/lib/highlight/use-highlight"
import { checkSlug, savePaste } from "@/lib/pastes/actions"
import { detectLanguage } from "@/lib/pastes/languages"
import type { Expiry, Visibility } from "@/lib/pastes/types"
import { indentUnit, type Preferences } from "@/lib/preferences"
import { findSecrets } from "@/lib/secrets"

export interface EditorFile {
  id: string
  name: string
  content: string
}

export interface EditorInitial {
  title: string
  description: string
  files: { name: string; content: string }[]
  visibility: Visibility
  expiry: Expiry | "keep"
  slug: string
  collection: string | null
  hasPassword: boolean
  burnAfterRead: boolean
}

const visibilityOptions: { value: Visibility; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
]

const visibilityHelp: Record<Visibility, string> = {
  private: "Only you and people you invite can open it.",
  unlisted: "Anyone with the link can open it. It isn't listed on your profile.",
  public: "Listed on your profile and open to anyone.",
}

const expiryOptions: { value: Expiry; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "1d", label: "1d" },
  { value: "1w", label: "1w" },
  { value: "1m", label: "1m" },
  { value: "never", label: "Never" },
]

const NO_COLLECTION = "none"

let fileCounter = 0
function newFile(name: string, content = ""): EditorFile {
  fileCounter += 1
  return { id: `file-${fileCounter}`, name, content }
}

function useSlugStatus(slug: string, except?: string) {
  const [status, setStatus] = React.useState<"idle" | "checking" | "ok" | "taken">("idle")

  React.useEffect(() => {
    if (!slug || slug === except) return setStatus("idle")

    setStatus("checking")
    let cancelled = false
    const timer = setTimeout(async () => {
      const available = await checkSlug(slug, except)
      if (!cancelled) setStatus(available ? "ok" : "taken")
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug, except])

  return status
}

export function PasteEditor({
  initial,
  editing,
  currentExpiry,
  collections,
  indentation = "2",
  secretDetection = true,
}: {
  initial: EditorInitial
  // Slug of the paste being edited; omitted for a new paste.
  editing?: string
  // Human label for the current expiry when editing ("Oct 12, 09:24").
  currentExpiry?: string
  collections: Collection[]
  // From the viewer's Settings: what Tab inserts, and whether to warn about pasted secrets.
  indentation?: Preferences["indentation"]
  secretDetection?: boolean
}) {
  const host = useSiteHost()
  const router = useRouter()
  const [title, setTitle] = React.useState(initial.title)
  const [description, setDescription] = React.useState(initial.description)
  const [files, setFiles] = React.useState<EditorFile[]>(() =>
    initial.files.map((file) => newFile(file.name, file.content)),
  )
  const [activeId, setActiveId] = React.useState(() => files[0]?.id ?? "")
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState(false)
  const [visibility, setVisibility] = React.useState(initial.visibility)
  const [expiry, setExpiry] = React.useState(initial.expiry)
  const [slug, setSlug] = React.useState(initial.slug)
  const [collection, setCollection] = React.useState(initial.collection)
  const [passwordOn, setPasswordOn] = React.useState(initial.hasPassword)
  const [password, setPassword] = React.useState("")
  const [burnAfterRead, setBurnAfterRead] = React.useState(initial.burnAfterRead)
  const [cursor, setCursor] = React.useState({ line: 1, column: 1 })
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [mobileMore, setMobileMore] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)
  const slugStatus = useSlugStatus(slug, editing)

  const active = files.find((file) => file.id === activeId) ?? files[0]
  const language = detectLanguage(active?.name ?? "")
  const totalBytes = files.reduce((size, file) => size + byteLength(file.content), 0)
  const lineCount = (active?.content ?? "").split("\n").length
  const lines = useHighlight(active?.content ?? "", active?.name ?? "")
  // The code view drops one trailing newline; the textarea shows it as an empty last line.
  const previewLines = active?.content.endsWith("\n") ? lines?.slice(0, -1) : lines
  const secret = React.useMemo(
    () => (secretDetection ? findSecrets(files) : null),
    [files, secretDetection],
  )

  function updateActive(patch: Partial<EditorFile>) {
    setFiles((current) =>
      current.map((file) => (file.id === active?.id ? { ...file, ...patch } : file)),
    )
  }

  function addFile() {
    const file = newFile(`untitled-${files.length + 1}.txt`)
    setFiles((current) => [...current, file])
    setActiveId(file.id)
    setRenamingId(file.id)
    setPreview(false)
  }

  function removeFile(id: string) {
    if (files.length === 1) return
    const index = files.findIndex((file) => file.id === id)
    const next = files.filter((file) => file.id !== id)
    setFiles(next)
    if (id === activeId) setActiveId(next[Math.max(0, index - 1)]?.id ?? "")
  }

  function trackCursor(textarea: HTMLTextAreaElement) {
    const before = textarea.value.slice(0, textarea.selectionStart)
    const lines = before.split("\n")
    setCursor({ line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 })
  }

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tab indents (by the Settings indentation) instead of leaving the editor.
    if (event.key !== "Tab" || event.shiftKey) return
    event.preventDefault()
    const textarea = event.currentTarget
    const { selectionStart, selectionEnd, value } = textarea
    const unit = indentUnit(indentation)
    const next = `${value.slice(0, selectionStart)}${unit}${value.slice(selectionEnd)}`
    updateActive({ content: next })
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = selectionStart + unit.length
    })
  }

  function submit() {
    setError(null)
    if (slugStatus === "taken") {
      setError(`${host}/${slug} is taken. Pick another custom link.`)
      return
    }

    startTransition(async () => {
      const result = await savePaste(
        {
          title,
          description,
          files: files.map(({ name, content }) => ({ name, content })),
          visibility,
          expiry,
          slug,
          collection,
          password: passwordOn ? password : null,
          burnAfterRead,
        },
        editing,
      )

      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/pastes/${result.slug}`)
    })
  }

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const submitLabel = editing ? "Save changes" : "Create paste"
  const cancelHref = editing ? `/pastes/${editing}` : "/pastes"

  const passwordField = passwordOn ? (
    <PasswordInput
      value={password}
      onChange={setPassword}
      placeholder={initial.hasPassword ? "Leave empty to keep the current one" : "Password"}
    />
  ) : null

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex min-h-svh flex-col lg:min-h-0 lg:gap-5 lg:p-7"
    >
      {/* Mobile header from the Paper "New paste" artboard */}
      <div className="sticky top-0 z-20 flex h-[52px] items-center justify-between bg-background px-4 pt-[env(safe-area-inset-top)] box-content lg:hidden">
        <Link href={cancelHref} className="text-[15px] text-foreground/80">
          Cancel
        </Link>
        <span className="text-[15px] font-semibold">{editing ? "Edit paste" : "New paste"}</span>
        <button
          type="button"
          onClick={() => setPreview((value) => !value)}
          aria-pressed={preview}
          className={cn("text-[15px] text-muted-foreground", preview && "text-link")}
        >
          {preview ? "Edit" : "Preview"}
        </button>
      </div>

      <div className="flex flex-col gap-1 px-4 pb-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:p-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="hidden text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase lg:block">
            {editing ? "Edit paste" : "New paste"}
          </span>
          <input
            aria-label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled paste"
            maxLength={120}
            required
            className="w-full bg-transparent font-heading text-[28px] leading-9 font-bold tracking-[-0.02em] caret-primary outline-none placeholder:text-muted-foreground/50 lg:text-[32px] lg:leading-[38px]"
          />
          <input
            aria-label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a description (optional)"
            maxLength={280}
            className="w-full bg-transparent text-[15px] leading-5 outline-none placeholder:text-muted-foreground lg:text-[13px] lg:leading-[18px]"
          />
        </div>
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <Button
            variant="ghost"
            size="lg"
            className="text-[13px]"
            render={<Link href={cancelHref} />}
            nativeButton={false}
          >
            {editing ? "Cancel" : "Discard"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-pressed={preview}
            onClick={() => setPreview((value) => !value)}
            className="text-[13px]"
          >
            <EyeIcon />
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button type="submit" size="lg" disabled={pending} className="gap-2 text-[13px]">
            {pending ? "Saving…" : submitLabel}
            <Kbd className="bg-primary-foreground/20 text-primary-foreground">⌘↵</Kbd>
          </Button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive lg:mx-0"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-5 lg:flex-row lg:items-start">
        <div className="mx-4 flex min-h-[340px] min-w-0 flex-1 flex-col border border-border lg:mx-0 lg:min-h-[548px]">
          <div
            role="tablist"
            aria-label="Files"
            className="flex h-11 shrink-0 overflow-x-auto border-b border-border bg-sidebar"
          >
            {files.map((file) => {
              const selected = file.id === active?.id
              return (
                <div
                  key={file.id}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-r border-border px-3.5",
                    selected && "bg-background shadow-[inset_0_2px_0_var(--primary)]",
                  )}
                >
                  <LanguageMarker language={detectLanguage(file.name).id} />
                  {renamingId === file.id ? (
                    <input
                      // biome-ignore lint/a11y/noAutofocus: renaming starts right after the user asks for it
                      autoFocus
                      aria-label="File name"
                      defaultValue={file.name}
                      onFocus={(event) => {
                        // Select the name without its extension, like a file manager would.
                        const dot = file.name.lastIndexOf(".")
                        event.currentTarget.setSelectionRange(0, dot > 0 ? dot : file.name.length)
                      }}
                      onBlur={(event) => {
                        const name = event.target.value.trim()
                        if (name)
                          setFiles((current) =>
                            current.map((f) => (f.id === file.id ? { ...f, name } : f)),
                          )
                        setRenamingId(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          event.currentTarget.blur()
                        }
                        if (event.key === "Escape") setRenamingId(null)
                      }}
                      className="w-36 bg-transparent font-mono text-[13px] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-describedby="rename-hint"
                      onClick={() => setActiveId(file.id)}
                      onDoubleClick={() => setRenamingId(file.id)}
                      className={cn(
                        "font-mono text-[13px] outline-none focus-visible:underline",
                        selected ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {file.name}
                    </button>
                  )}
                  {selected && files.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeFile(file.id)}
                      className="text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <XIcon className="size-3" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </div>
              )
            })}
            <span id="rename-hint" className="sr-only">
              Double-click to rename
            </span>
            {files.length < 10 ? (
              <button
                type="button"
                onClick={addFile}
                className="flex shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <PlusIcon className="size-3.5" />
                <span className="hidden lg:inline">Add file</span>
              </button>
            ) : null}
          </div>

          {preview ? (
            <CodeBlock
              content={active?.content || " "}
              highlighted={previewLines}
              wrap
              className="flex-1"
            />
          ) : (
            <div className="flex flex-1 gap-[18px] overflow-auto p-4 font-mono text-[13px] leading-[22px]">
              <div
                aria-hidden="true"
                className="hidden shrink-0 text-right text-muted-foreground/60 select-none lg:block"
              >
                {Array.from({ length: lineCount }, (_, index) => (
                  <div key={index}>{index + 1}</div>
                ))}
              </div>
              <HighlightedTextarea
                aria-label={`Contents of ${active?.name ?? "file"}`}
                lines={lines}
                value={active?.content ?? ""}
                onChange={(event) => {
                  updateActive({ content: event.target.value })
                  trackCursor(event.target)
                }}
                onSelect={(event) => trackCursor(event.currentTarget)}
                onKeyDown={onEditorKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Paste or type code…"
                rows={Math.max(lineCount, 12)}
                wrap="off"
                metricsClassName="text-base leading-[22px] lg:text-[13px] lg:leading-[22px]"
              />
            </div>
          )}

          {secret ? (
            <p
              role="status"
              className="border-t border-primary bg-primary/5 px-4 py-2 text-xs text-link"
            >
              Line {secret.line} of {secret.file} looks like {secret.name}. Anyone with the link can
              read it, so remove it or keep the paste private.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              Detected
              <span className="bg-muted px-1.5 py-px font-medium text-foreground">
                {language.name}
              </span>
            </span>
            <span className="tabular-nums">
              <span className="hidden sm:inline">
                Ln {cursor.line}, Col {cursor.column} ·{" "}
              </span>
              {files.length} {files.length === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
            </span>
          </div>
        </div>

        {/* Desktop options panel */}
        <div className="hidden w-[340px] shrink-0 flex-col gap-[18px] border border-border p-4 lg:flex">
          <h2 className="text-sm font-semibold">Options</h2>
          <OptionGroup label="Visibility" id="visibility-label">
            <SegmentedControl
              aria-labelledby="visibility-label"
              value={visibility}
              onValueChange={setVisibility}
              options={visibilityOptions}
            />
            <p className="text-xs text-muted-foreground">{visibilityHelp[visibility]}</p>
          </OptionGroup>
          <OptionGroup label="Expires after" id="expiry-label">
            <ExpiryChips
              value={expiry}
              onChange={setExpiry}
              options={expiryOptions}
              currentExpiry={currentExpiry}
            />
          </OptionGroup>
          <OptionGroup label="Custom link" id="slug-label">
            <SlugInput value={slug} onChange={setSlug} status={slugStatus} />
          </OptionGroup>
          <OptionGroup label="Collection" id="collection-label">
            <CollectionSelect
              value={collection}
              onChange={setCollection}
              collections={collections}
            />
          </OptionGroup>
          <div className="h-px bg-border" />
          <div className="flex flex-col gap-3">
            <ToggleRow
              label="Password"
              description="Visitors must enter it to view"
              checked={passwordOn}
              onCheckedChange={setPasswordOn}
            />
            {passwordField}
            <ToggleRow
              label="Burn after read"
              description="Delete after the first view"
              checked={burnAfterRead}
              onCheckedChange={setBurnAfterRead}
            />
          </div>
        </div>
      </div>

      {/* Mobile bottom panel */}
      <div className="sticky bottom-0 z-20 mt-6 flex flex-col gap-4 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.04)] lg:hidden">
        <span aria-hidden="true" className="mx-auto h-1 w-9 bg-border" />
        <SegmentedControl
          aria-label="Visibility"
          value={visibility}
          onValueChange={setVisibility}
          options={visibilityOptions}
          itemClassName="py-2.5 text-[15px]"
          className="border border-border bg-muted"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px]">Expires after</span>
          <ExpiryChips
            value={expiry}
            onChange={setExpiry}
            options={expiryOptions.filter((option) => ["1d", "1w", "never"].includes(option.value))}
            currentExpiry={currentExpiry}
          />
        </div>
        <ToggleRow
          label="Password"
          description="Visitors must enter it to view"
          checked={passwordOn}
          onCheckedChange={setPasswordOn}
          large
        />
        {passwordField}
        {mobileMore ? (
          <>
            <OptionGroup label="Custom link" id="slug-label-mobile">
              <SlugInput value={slug} onChange={setSlug} status={slugStatus} />
            </OptionGroup>
            <OptionGroup label="Collection" id="collection-label-mobile">
              <CollectionSelect
                value={collection}
                onChange={setCollection}
                collections={collections}
              />
            </OptionGroup>
            <ToggleRow
              label="Burn after read"
              description="Delete after the first view"
              checked={burnAfterRead}
              onCheckedChange={setBurnAfterRead}
              large
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setMobileMore(true)}
            className="self-start text-sm text-muted-foreground underline underline-offset-2"
          >
            More options
          </button>
        )}
        <Button type="submit" disabled={pending} className="h-[50px] text-base font-semibold">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function OptionGroup({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-[13px] leading-[18px] font-medium">
        {label}
      </span>
      {children}
    </div>
  )
}

function ExpiryChips({
  value,
  onChange,
  options,
  currentExpiry,
}: {
  value: Expiry | "keep"
  onChange: (value: Expiry | "keep") => void
  options: { value: Expiry; label: string }[]
  currentExpiry?: string
}) {
  const all: { value: Expiry | "keep"; label: string }[] = currentExpiry
    ? [{ value: "keep", label: "Keep" }, ...options]
    : options

  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Expires after" className="flex flex-wrap gap-1.5">
        {all.map((option) => (
          // biome-ignore lint/a11y/useSemanticElements: styled chips acting as a radio group
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "border border-border px-2.5 py-[5px] text-[13px] leading-[18px] text-foreground/80 outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40",
              value === option.value &&
                "border-foreground bg-foreground font-medium text-background hover:border-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {currentExpiry && value === "keep" ? (
        <p className="text-xs text-muted-foreground">Currently {currentExpiry}.</p>
      ) : null}
    </div>
  )
}

function SlugInput({
  value,
  onChange,
  status,
}: {
  value: string
  onChange: (value: string) => void
  status: ReturnType<typeof useSlugStatus>
}) {
  const host = useSiteHost()
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex h-[34px] items-center border border-input focus-within:border-primary",
          status === "taken" && "border-destructive",
        )}
      >
        <span className="flex h-full items-center border-r border-input bg-sidebar pr-2 pl-2.5 font-mono text-xs text-muted-foreground">
          {host}/
        </span>
        <input
          aria-label="Custom link"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^A-Za-z0-9_-]/g, ""))}
          placeholder="random"
          maxLength={40}
          spellCheck={false}
          autoCapitalize="none"
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base outline-none placeholder:text-muted-foreground lg:text-xs"
        />
        {status === "ok" ? (
          <CheckIcon
            aria-label="Available"
            className="mr-2.5 size-[15px] text-link"
            strokeWidth={2.5}
          />
        ) : null}
        {status === "taken" ? (
          <XIcon
            aria-label="Taken"
            className="mr-2.5 size-[15px] text-destructive"
            strokeWidth={2.5}
          />
        ) : null}
      </div>
      {status === "taken" ? (
        <p className="text-xs text-destructive">That link is taken or reserved.</p>
      ) : null}
    </div>
  )
}

function CollectionSelect({
  value,
  onChange,
  collections,
}: {
  value: string | null
  onChange: (value: string | null) => void
  collections: Collection[]
}) {
  if (collections.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No collections yet.{" "}
        <a
          href="/collections"
          target="_blank"
          rel="noopener"
          className="font-medium text-link hover:underline"
        >
          Create one
        </a>{" "}
        to file pastes under it.
      </p>
    )
  }

  return (
    <Select
      value={value ?? NO_COLLECTION}
      onValueChange={(next) => onChange(next === NO_COLLECTION ? null : (next as string))}
      items={[
        { value: NO_COLLECTION, label: "No collection" },
        ...collections.map((c) => ({ value: c.slug, label: c.name })),
      ]}
    >
      <SelectTrigger
        aria-label="Collection"
        className="h-[34px] w-full px-2.5 font-mono text-[13px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_COLLECTION} className="font-sans text-muted-foreground">
          No collection
        </SelectItem>
        {collections.map((c) => (
          <SelectItem key={c.slug} value={c.slug} className="font-mono text-[13px]">
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  large = false,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  large?: boolean
  disabled?: boolean
}) {
  const id = React.useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span
          id={id}
          className={cn(
            "text-[13px] leading-[18px] font-medium",
            large && "text-[15px] leading-5 font-normal",
          )}
        >
          {label}
        </span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
      <Switch
        aria-labelledby={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input
        aria-label="Paste password"
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[34px] pr-9 text-base lg:text-sm"
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((current) => !current)}
        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {visible ? <EyeOffIcon className="size-[15px]" /> : <EyeIcon className="size-[15px]" />}
      </button>
    </div>
  )
}
