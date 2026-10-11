"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import { Checkbox } from "@sniptide/ui/components/checkbox"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@sniptide/ui/components/sheet"
import { ArrowUpRightIcon, CheckIcon, DownloadIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { formatBytes } from "@/lib/format"
import { type GistPreview, importGist, previewGist } from "@/lib/pastes/actions"

// Same shape the server accepts: a gist URL or its id, so reading can start as soon as one is
// pasted.
const GIST_LINK = /[0-9a-f]{20,40}\/?(?:#.*)?$/i
const MAX_FILES = 10
const READ_DELAY = 600

type Step = "link" | "reading" | "files"

// What's selected by default: the files that can be imported, in order, until the paste is full.
function defaultSelection(gist: GistPreview) {
  const selected = new Set<string>()
  let total = 0
  for (const file of gist.files) {
    if (file.skipped || selected.size >= MAX_FILES || total + file.size > gist.limitBytes) continue
    selected.add(file.name)
    total += file.size
  }
  return selected
}

const shortLink = (link: string) => link.trim().replace(/^https?:\/\//i, "")

// Disabled looks the same for both footer buttons, as in the design: a flat grey button.
const footerButton =
  "h-[34px] px-3.5 disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"

// The import sheet. The caller owns `open`, so the Import gist buttons and the sidebar's More menu
// can open the same one; `children` is where a trigger goes when the sheet has its own.
export function ImportGistSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>("link")
  const [link, setLink] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [gist, setGist] = React.useState<GistPreview | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState<"import" | "editor" | null>(null)
  const [importError, setImportError] = React.useState<string | null>(null)

  const inputRef = React.useRef<HTMLInputElement>(null)
  // Reads that were started and then superseded (or the sheet closed) are ignored when they land.
  const attempt = React.useRef(0)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function reset() {
    attempt.current++
    clearTimeout(timer.current)
    setStep("link")
    setLink("")
    setError(null)
    setGist(null)
    setSelected(new Set())
    setBusy(null)
    setImportError(null)
  }

  async function read(value: string) {
    clearTimeout(timer.current)
    const current = ++attempt.current
    setError(null)
    setStep("reading")

    const result = await previewGist(value).catch(() => null)
    if (current !== attempt.current) return
    if (!result?.ok) {
      setError(result?.error ?? "Something went wrong. Try again.")
      setStep("link")
      return
    }
    setGist(result.gist)
    setSelected(defaultSelection(result.gist))
    setStep("files")
  }

  // Closing also forgets the gist, so the next opening starts at the link again. That matters when
  // the sheet outlives the page it was opened from, as it does in the sidebar.
  function close() {
    onOpenChange(false)
    reset()
  }

  const chosen = gist ? gist.files.filter((file) => selected.has(file.name)) : []
  const chosenBytes = chosen.reduce((sum, file) => sum + file.size, 0)
  const overLimit = gist ? chosenBytes > gist.limitBytes : false
  const canImport = step === "files" && chosen.length > 0 && !overLimit && busy === null

  // Saves the paste now, then opens it.
  async function importNow() {
    if (!gist || !canImport) return
    setBusy("import")
    setImportError(null)
    const result = await importGist({ id: gist.id, files: chosen.map((file) => file.name) }).catch(
      () => null,
    )
    if (!result?.ok) {
      setImportError(result?.error ?? "Something went wrong. Try again.")
      setBusy(null)
      return
    }
    close()
    router.push(`/pastes/${result.slug}`)
  }

  // Nothing is saved: the new paste page reads the chosen files and fills in the editor.
  function openInEditor() {
    if (!gist || !canImport) return
    setBusy("editor")
    const params = new URLSearchParams({ gist: gist.id })
    for (const file of chosen) params.append("file", file.name)
    close()
    router.push(`/new?${params}`)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        reset()
      }}
    >
      {children}
      <SheetContent side="right" className="w-[400px] max-w-full" initialFocus={inputRef}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b pr-4 pl-6">
          <SheetTitle className="text-[15px] leading-5 font-semibold">Import a gist</SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
            <XIcon />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">
          Copy files from a public GitHub gist into a new paste.
        </SheetDescription>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {step === "files" && gist ? (
            <FilesStep
              link={link}
              gist={gist}
              selected={selected}
              onSelect={(name, checked) =>
                setSelected((previous) => {
                  const next = new Set(previous)
                  if (checked) next.add(name)
                  else next.delete(name)
                  return next
                })
              }
              chosenBytes={chosenBytes}
              overLimit={overLimit}
              error={importError}
            />
          ) : step === "reading" ? (
            <ReadingStep link={link} />
          ) : (
            <form
              className="flex flex-col gap-2.5"
              onSubmit={(event) => {
                event.preventDefault()
                if (GIST_LINK.test(link.trim())) read(link)
                else setError("Paste a gist link like gist.github.com/you/1a2b3c…")
              }}
            >
              <Label htmlFor="gist-link">Gist link</Label>
              <Input
                ref={inputRef}
                id="gist-link"
                name="gist"
                value={link}
                onChange={(event) => {
                  const value = event.target.value
                  setLink(value)
                  setError(null)
                  clearTimeout(timer.current)
                  if (!GIST_LINK.test(value.trim())) return
                  // A paste is a finished link; typing waits for a pause.
                  const pasted = (event.nativeEvent as InputEvent).inputType === "insertFromPaste"
                  if (pasted) read(value)
                  else timer.current = setTimeout(() => read(value), READ_DELAY)
                }}
                placeholder="gist.github.com/you/1a2b3c…"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "gist-link-error" : undefined}
                className="font-mono text-base lg:text-xs"
              />
              {error ? (
                <p id="gist-link-error" role="alert" className="text-xs leading-4 text-destructive">
                  {error}
                </p>
              ) : null}
            </form>
          )}
        </div>

        <div className="flex h-16 shrink-0 items-center justify-between border-t px-6">
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                className="h-[34px] px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              />
            }
          >
            Cancel
          </SheetClose>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className={footerButton}
              disabled={!canImport}
              onClick={importNow}
            >
              {busy === "import" ? "Importing…" : "Import now"}
            </Button>
            <Button
              type="button"
              className={footerButton}
              disabled={!canImport}
              onClick={openInEditor}
            >
              Open in editor
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// The "Import gist" button of the list pages and the dashboard.
export function ImportGistButton() {
  const [open, setOpen] = React.useState(false)

  return (
    <ImportGistSheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="lg" />}>
        <DownloadIcon />
        Import gist
      </SheetTrigger>
    </ImportGistSheet>
  )
}

function LinkBox({ link, status }: { link: string; status: "reading" | "read" }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border px-3">
      <span className="truncate font-mono text-xs leading-4">{shortLink(link)}</span>
      {status === "reading" ? (
        <LoaderCircleIcon className="size-4 animate-spin text-primary" aria-hidden />
      ) : (
        <CheckIcon className="size-4 text-[#1F8A4C]" aria-hidden />
      )}
    </div>
  )
}

function ReadingStep({ link }: { link: string }) {
  return (
    <>
      <LinkBox link={link} status="reading" />
      <p role="status" className="sr-only">
        Reading the gist…
      </p>
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="h-5 w-[220px] bg-muted" />
        <div className="h-3 w-40 bg-muted" />
      </div>
      <div className="flex flex-col border" aria-hidden>
        {[150, 120, 90].map((width) => (
          <div key={width} className="flex h-11 items-center gap-3 border-b px-3 last:border-b-0">
            <div className="size-4 shrink-0 bg-muted" />
            <div className="h-3 bg-muted" style={{ width }} />
          </div>
        ))}
      </div>
    </>
  )
}

function FilesStep({
  link,
  gist,
  selected,
  onSelect,
  chosenBytes,
  overLimit,
  error,
}: {
  link: string
  gist: GistPreview
  selected: Set<string>
  onSelect: (name: string, checked: boolean) => void
  chosenBytes: number
  overLimit: boolean
  error: string | null
}) {
  const { owner } = gist

  return (
    <>
      <LinkBox link={link} status="read" />
      <div className="flex flex-col gap-2">
        <h3 className="line-clamp-2 text-lg leading-6 font-semibold tracking-[-0.01em]">
          {gist.title}
        </h3>
        {owner ? (
          <a
            href={owner.url}
            target="_blank"
            rel="noreferrer"
            className="group flex w-fit max-w-full items-center gap-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <Avatar className="size-5 text-[11px]">
              {owner.avatarUrl ? <AvatarImage src={owner.avatarUrl} alt="" /> : null}
              <AvatarFallback>{owner.login.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm leading-5 font-medium group-hover:underline">
              {owner.login}
            </span>
            <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">(opens GitHub in a new tab)</span>
          </a>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] leading-[18px] font-medium">Files</span>
          <span className="text-xs leading-4 text-muted-foreground" aria-live="polite">
            {selected.size} of {gist.files.length} selected
          </span>
        </div>
        <ul className="flex flex-col border">
          {gist.files.map((file, index) => {
            const checked = selected.has(file.name)
            const disabled = Boolean(file.skipped) || (!checked && selected.size >= MAX_FILES)
            return (
              <li key={file.name} className="border-b last:border-b-0">
                <label
                  htmlFor={`gist-file-${index}`}
                  className={`flex min-h-11 items-center gap-3 px-3 py-2.5 ${
                    file.skipped ? "bg-muted/40" : "cursor-pointer hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    id={`gist-file-${index}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(next) => onSelect(file.name, next)}
                    aria-label={file.name}
                  />
                  <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span
                      className={`truncate font-mono text-[13px] leading-[18px] ${
                        file.skipped ? "text-muted-foreground/70" : ""
                      }`}
                    >
                      {file.name}
                    </span>
                    {file.skipped ? (
                      <span className="text-xs leading-4 text-muted-foreground">
                        {file.skipped}
                      </span>
                    ) : null}
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs leading-4 text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <p
          className={`text-xs leading-4 ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {formatBytes(chosenBytes)} of {gist.limitLabel}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-xs leading-4 text-destructive">
          {error}
        </p>
      ) : null}
    </>
  )
}
