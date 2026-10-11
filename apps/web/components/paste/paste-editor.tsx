"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { Kbd } from "@sniptide/ui/components/kbd"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, ChevronDownIcon, EyeIcon, FolderIcon, LinkIcon, LockIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { CodeBlock } from "@/components/paste/code-block"
import {
  CollectionSelect,
  ExpiryChips,
  expiryOptions,
  OptionGroup,
  PasswordInput,
  SlugInput,
  ToggleRow,
  useSlugStatus,
  visibilityHelp,
  visibilityOptions,
} from "@/components/paste/editor-options"
import { type EditorFile, FileTabs } from "@/components/paste/file-tabs"
import { HighlightedTextarea } from "@/components/paste/highlighted-textarea"
import { LanguageMarker } from "@/components/paste/language-marker"
import {
  type PanelSection,
  SidePanel,
  SidePanelProvider,
  SidePanelToggle,
} from "@/components/paste/side-panel"
import { HeaderActions, HeaderTitle } from "@/components/shell/page-header"
import { useSiteHost } from "@/components/site-host"
import type { Collection } from "@/lib/collections/types"
import { byteLength, formatBytes } from "@/lib/format"
import { useHighlight } from "@/lib/highlight/use-highlight"
import { savePaste } from "@/lib/pastes/actions"
import { detectLanguage, languages, renameForLanguage } from "@/lib/pastes/languages"
import type { Expiry, Visibility } from "@/lib/pastes/types"
import { indentUnit, type Preferences } from "@/lib/preferences"
import { findSecrets } from "@/lib/secrets"

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

let fileCounter = 0
function newFile(name: string, content = ""): EditorFile {
  fileCounter += 1
  return { id: `file-${fileCounter}`, name, content }
}

export function PasteEditor({
  initial,
  editing,
  currentExpiry,
  collections,
  indentation = "2",
  secretDetection = true,
  notice,
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
  // Shown like a save error when the page couldn't prefill the editor (a gist that can't be read).
  notice?: string
}) {
  const host = useSiteHost()
  const router = useRouter()
  const [title, setTitle] = React.useState(initial.title)
  const [description, setDescription] = React.useState(initial.description)
  const [files, setFiles] = React.useState<EditorFile[]>(() =>
    initial.files.map((file) => newFile(file.name, file.content)),
  )
  const [activeId, setActiveId] = React.useState(() => files[0]?.id ?? "")
  const [preview, setPreview] = React.useState(false)
  const [visibility, setVisibility] = React.useState(initial.visibility)
  const [expiry, setExpiry] = React.useState(initial.expiry)
  const [slug, setSlug] = React.useState(initial.slug)
  const [collection, setCollection] = React.useState(initial.collection)
  const [passwordOn, setPasswordOn] = React.useState(initial.hasPassword)
  const [password, setPassword] = React.useState("")
  const [burnAfterRead, setBurnAfterRead] = React.useState(initial.burnAfterRead)
  const [cursor, setCursor] = React.useState({ line: 1, column: 1 })
  const [error, setError] = React.useState<string | null>(notice ?? null)
  const [pending, startTransition] = React.useTransition()
  const [mobileMore, setMobileMore] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)
  const formId = React.useId()
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
    setPreview(false)
    return file.id
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

  const panelSections: PanelSection[] = [
    {
      id: "access",
      label: "Visibility & expiry",
      icon: EyeIcon,
      content: (
        <>
          <SegmentedControl
            aria-label="Visibility"
            value={visibility}
            onValueChange={setVisibility}
            options={visibilityOptions}
          />
          <p className="text-xs text-muted-foreground">{visibilityHelp[visibility]}</p>
          <div className="mt-1 flex flex-col gap-2">
            <span className="text-muted-foreground">Expires after</span>
            <ExpiryChips
              value={expiry}
              onChange={setExpiry}
              options={expiryOptions}
              currentExpiry={currentExpiry}
            />
          </div>
        </>
      ),
    },
    {
      id: "slug",
      label: "Custom link",
      icon: LinkIcon,
      content: <SlugInput value={slug} onChange={setSlug} status={slugStatus} />,
    },
    {
      id: "collection",
      label: "Collection",
      icon: FolderIcon,
      marked: collection !== null,
      content: (
        <CollectionSelect value={collection} onChange={setCollection} collections={collections} />
      ),
    },
    {
      id: "protection",
      label: "Protection",
      icon: LockIcon,
      marked: passwordOn || burnAfterRead,
      content: (
        <>
          <ToggleRow
            label="Password"
            description="Visitors must enter it to view"
            checked={passwordOn}
            onCheckedChange={setPasswordOn}
          />
          {passwordField}
          <ToggleRow
            label="Burn after reading"
            description="Deleted after the first view"
            checked={burnAfterRead}
            onCheckedChange={setBurnAfterRead}
          />
        </>
      ),
    },
  ]

  return (
    <form
      ref={formRef}
      id={formId}
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

      <HeaderTitle>{editing ? "Edit paste" : "New paste"}</HeaderTitle>
      <HeaderActions>
        <Button variant="ghost" size="lg" render={<Link href={cancelHref} />} nativeButton={false}>
          {editing ? "Cancel" : "Discard"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-pressed={preview}
          onClick={() => setPreview((value) => !value)}
        >
          <EyeIcon />
          {preview ? "Edit" : "Preview"}
        </Button>
        <Button type="submit" form={formId} size="lg" disabled={pending} className="gap-2">
          {pending ? "Saving…" : submitLabel}
          <Kbd className="bg-primary-foreground/20 text-primary-foreground">⌘↵</Kbd>
        </Button>
      </HeaderActions>

      <div className="flex min-w-0 flex-col gap-1.5 px-4 pb-4 lg:p-0">
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
          className="w-full bg-transparent text-[15px] leading-5 outline-none placeholder:text-muted-foreground lg:text-sm lg:leading-5"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive lg:mx-0"
        >
          {error}
        </p>
      ) : null}

      <SidePanelProvider>
        <div className="flex flex-1 flex-col gap-5 lg:flex-row lg:items-start">
          <div className="mx-4 flex min-h-[340px] min-w-0 flex-1 flex-col border border-border lg:mx-0 lg:min-h-[548px]">
            <FileTabs
              files={files}
              activeId={active?.id}
              onSelect={setActiveId}
              onRename={(id, name) =>
                setFiles((current) => current.map((f) => (f.id === id ? { ...f, name } : f)))
              }
              onRemove={removeFile}
              onAdd={addFile}
              trailing={<SidePanelToggle />}
            />

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
                Line {secret.line} of {secret.file} looks like {secret.name}. Anyone with the link
                can read it, so remove it or keep the paste private.
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Language: ${language.name}`}
                  className="-ml-1.5 flex items-center gap-2 px-1.5 py-0.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
                >
                  <LanguageMarker language={language.id} />
                  <span className="font-medium text-foreground">{language.name}</span>
                  <ChevronDownIcon className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="max-h-80 min-w-44 overflow-y-auto"
                >
                  {languages.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() => {
                        if (active) updateActive({ name: renameForLanguage(active.name, option) })
                      }}
                    >
                      <LanguageMarker language={option.id} />
                      {option.name}
                      {option.id === language.id ? <CheckIcon className="ml-auto" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="tabular-nums">
                <span className="hidden sm:inline">
                  Ln {cursor.line}, Col {cursor.column} ·{" "}
                </span>
                {files.length} {files.length === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
              </span>
            </div>
          </div>

          <SidePanel label="Options" sections={panelSections} defaultOpen={["access"]} />
        </div>
      </SidePanelProvider>

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
