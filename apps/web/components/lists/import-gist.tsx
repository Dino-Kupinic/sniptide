"use client"

import { Button } from "@sniptide/ui/components/button"
import { Checkbox } from "@sniptide/ui/components/checkbox"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@sniptide/ui/components/sheet"
import { CheckIcon, DownloadIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { formatBytes, timeAgo } from "@/lib/format"
import { type GistPreview, importGist, previewGist } from "@/lib/pastes/actions"
import type { Visibility } from "@/lib/pastes/types"

// Same shape the server accepts: a gist URL or its id, so reading can start as soon as one is
// pasted.
const GIST_LINK = /[0-9a-f]{20,40}\/?(?:#.*)?$/i
const MAX_FILES = 10
const READ_DELAY = 600

const visibilityHelp: Record<Visibility, string> = {
  private: "Only you and people you invite can open it.",
  unlisted: "Anyone with the link can view. Hidden from search.",
  public: "Listed on your profile and open to anyone.",
}

const visibilityOptions: { value: Visibility; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
]

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

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

const shortLink = (link: string) => link.trim().replace(/^https?:\/\//i, "")

export function ImportGistButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<Step>("link")
  const [link, setLink] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [gist, setGist] = React.useState<GistPreview | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [visibility, setVisibility] = React.useState<Visibility>("unlisted")
  const [importing, setImporting] = React.useState(false)
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
    setVisibility("unlisted")
    setImporting(false)
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

  async function runImport() {
    if (!gist || importing) return
    setImporting(true)
    setImportError(null)
    const result = await importGist({
      id: gist.id,
      files: gist.files.filter((file) => selected.has(file.name)).map((file) => file.name),
      visibility,
    }).catch(() => null)
    if (!result?.ok) {
      setImportError(result?.error ?? "Something went wrong. Try again.")
      setImporting(false)
      return
    }
    setOpen(false)
    router.push(`/pastes/${result.slug}`)
  }

  const chosen = gist ? gist.files.filter((file) => selected.has(file.name)) : []
  const chosenBytes = chosen.reduce((sum, file) => sum + file.size, 0)
  const overLimit = gist ? chosenBytes > gist.limitBytes : false
  const canImport = step === "files" && chosen.length > 0 && !overLimit && !importing

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        reset()
      }}
    >
      <SheetTrigger render={<Button variant="outline" size="lg" />}>
        <DownloadIcon />
        Import gist
      </SheetTrigger>
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
              visibility={visibility}
              onVisibility={setVisibility}
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
                aria-describedby="gist-link-note"
                className="font-mono text-base lg:text-xs"
              />
              {error ? (
                <p id="gist-link-note" role="alert" className="text-xs leading-4 text-destructive">
                  {error}
                </p>
              ) : (
                <p id="gist-link-note" className="text-xs leading-4 text-muted-foreground">
                  Public gists only. We read it first, nothing is saved until you import.
                </p>
              )}
            </form>
          )}
        </div>

        <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-t px-6">
          <SheetClose
            render={<Button type="button" variant="outline" className="h-[34px] px-3.5" />}
          >
            Cancel
          </SheetClose>
          <Button
            type="button"
            className="h-[34px] px-3.5 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            disabled={!canImport}
            onClick={runImport}
          >
            {importing
              ? "Importing…"
              : chosen.length > 0 && step === "files"
                ? `Import ${plural(chosen.length, "file")}`
                : "Import"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
  visibility,
  onVisibility,
  error,
}: {
  link: string
  gist: GistPreview
  selected: Set<string>
  onSelect: (name: string, checked: boolean) => void
  chosenBytes: number
  overLimit: boolean
  visibility: Visibility
  onVisibility: (visibility: Visibility) => void
  error: string | null
}) {
  const meta = [
    gist.owner,
    plural(gist.files.length, "file"),
    gist.updatedAt ? `updated ${timeAgo(Date.parse(gist.updatedAt))}` : null,
  ].filter(Boolean)

  return (
    <>
      <LinkBox link={link} status="read" />
      <div className="flex flex-col gap-0.5">
        <h3 className="text-lg leading-6 font-semibold tracking-[-0.01em]">{gist.title}</h3>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{meta.join(" · ")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] leading-[18px] font-medium">Files</span>
          <span
            className={`text-xs leading-4 ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {selected.size} of {gist.files.length} selected · {formatBytes(chosenBytes)} of{" "}
            {gist.limitLabel}
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
        {overLimit ? (
          <p role="alert" className="text-xs leading-4 text-destructive">
            The selected files are over the {gist.limitLabel} limit. Deselect some to import.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span id="gist-visibility" className="text-[13px] leading-[18px] font-medium">
          Visibility
        </span>
        <SegmentedControl
          aria-labelledby="gist-visibility"
          value={visibility}
          onValueChange={onVisibility}
          options={visibilityOptions}
        />
        <p className="text-xs leading-4 text-muted-foreground">{visibilityHelp[visibility]}</p>
      </div>

      {error ? (
        <p role="alert" className="text-xs leading-4 text-destructive">
          {error}
        </p>
      ) : null}
    </>
  )
}
