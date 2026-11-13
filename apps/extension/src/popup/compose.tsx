import type { Collection, Paste, Visibility } from "@sniptide/sdk"
import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Kbd } from "@sniptide/ui/components/kbd"
import { Label } from "@sniptide/ui/components/label"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { useEffect, useId, useRef, useState } from "react"
import { fileNameFor, MAX_FILE_NAME, MAX_TITLE, sourceDescription, titleFor } from "../lib/capture"
import { expiryLabels, messages } from "../lib/messages"
import { type PageText, readCodeBlocks, readSelection } from "../lib/page"
import { EXPIRIES, type Expiry, type Settings } from "../lib/protocol"
import { openTab } from "./app"
import { ask, errorMessage } from "./rpc"
import { visibilityOptions } from "./visibility"

const NO_COLLECTION = "none"
const isMac = navigator.platform.toLowerCase().includes("mac")

interface Draft {
  content: string
  fileName: string
  title: string
}

// What the open tab offers: the reader's selection, or the page's code blocks when nothing is
// selected. Chrome keeps extensions out of some pages, and those offer nothing.
async function readPage(): Promise<{
  selection: PageText | null
  blocks: PageText[]
  url: string
}> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url ?? ""
  if (tab?.id === undefined) return { selection: null, blocks: [], url }
  try {
    const target = { tabId: tab.id }
    const [selected] = await chrome.scripting.executeScript({ target, func: readSelection })
    if (selected?.result) return { selection: selected.result, blocks: [], url }
    const [found] = await chrome.scripting.executeScript({ target, func: readCodeBlocks })
    return { selection: null, blocks: found?.result ?? [], url }
  } catch {
    return { selection: null, blocks: [], url }
  }
}

export function Compose({ settings }: { settings: Settings }) {
  const [content, setContent] = useState("")
  const [fileName, setFileName] = useState("snippet.txt")
  const [title, setTitle] = useState("")
  const [visibility, setVisibility] = useState<Visibility>(settings.visibility)
  const [collection, setCollection] = useState(NO_COLLECTION)
  const [expiry, setExpiry] = useState<Expiry>("never")
  const [collections, setCollections] = useState<Collection[]>([])
  const [blocks, setBlocks] = useState<PageText[]>([])
  const [pageUrl, setPageUrl] = useState("")
  const [fromPage, setFromPage] = useState(false)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ paste: Paste; copied: boolean; warning: string | null }>()
  // One key per paste being written, so a retry after a dropped answer can't save it twice.
  const key = useRef(crypto.randomUUID())
  const contentId = useId()
  const fileNameId = useId()
  const titleId = useId()
  const visibilityId = useId()
  const collectionId = useId()
  const expiryId = useId()

  const fill = (page: PageText) => {
    setContent(page.text)
    setFileName(fileNameFor(page.text, page.hints))
    setTitle(titleFor(page))
    setFromPage(true)
  }

  useEffect(() => {
    void (async () => {
      const [page, stored] = await Promise.all([readPage(), chrome.storage.session.get("draft")])
      setPageUrl(page.url)
      setBlocks(page.blocks)
      const draft = stored.draft as Draft | undefined
      if (page.selection) fill(page.selection)
      else if (draft) {
        // The popup closes when it loses focus, so unsaved text comes back the next time.
        setContent(draft.content)
        setFileName(draft.fileName)
        setTitle(draft.title)
      }
      setReady(true)
    })()
    void ask({ type: "collections" })
      .then(setCollections)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!ready || saved) return
    const draft: Draft = { content, fileName, title }
    void chrome.storage.session.set({ draft })
  }, [ready, saved, content, fileName, title])

  async function save() {
    if (saving || !content.trim()) return
    setSaving(true)
    setError(null)
    try {
      const result = await ask({
        type: "create",
        key: key.current,
        expiry,
        input: {
          title: title.trim() || titleFor({ title: "", text: content }),
          description: fromPage && settings.includeSource ? sourceDescription(pageUrl) : "",
          visibility,
          collection: collection === NO_COLLECTION ? null : collection,
          files: [{ name: fileName.trim() || fileNameFor(content, []), content }],
        },
      })
      let copied = true
      try {
        await navigator.clipboard.writeText(result.paste.url)
      } catch {
        copied = false
      }
      await chrome.storage.session.remove("draft")
      setSaved({ ...result, copied })
    } catch (cause) {
      setError(errorMessage(cause, messages.unexpected))
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    const startOver = () => {
      key.current = crypto.randomUUID()
      setContent("")
      setTitle("")
      setFileName("snippet.txt")
      setFromPage(false)
      setSaved(undefined)
    }
    return (
      <div className="flex flex-col gap-4 p-4">
        <p role="status" className="flex items-center gap-2 text-sm leading-5 font-medium">
          <SuccessCheck className="text-highlight" />
          {saved.copied ? messages.savedTitle : messages.savedTitleNoCopy}
        </p>
        <p className="truncate rounded-lg bg-muted px-3 py-2 font-mono text-[13px] leading-5">
          {saved.paste.url}
        </p>
        <FormError message={saved.warning} />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => openTab(saved.paste.url)}>
            {messages.openPaste}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(saved.paste.url)
                setSaved({ ...saved, copied: true })
              } catch {
                setSaved({ ...saved, warning: messages.copyFailed })
              }
            }}
          >
            {messages.copyLink}
          </Button>
          <Button variant="ghost" onClick={startOver}>
            {messages.another}
          </Button>
        </div>
      </div>
    )
  }

  const collectionItems = [
    { value: NO_COLLECTION, label: messages.noCollection },
    ...collections.map((item) => ({ value: item.slug, label: item.name })),
  ]
  const expiryItems = EXPIRIES.map((value) => ({ value, label: expiryLabels[value] }))

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          void save()
        }
      }}
    >
      <div className="overflow-hidden rounded-lg border border-input focus-within:border-primary">
        <label htmlFor={fileNameId} className="sr-only">
          {messages.fileNameLabel}
        </label>
        <input
          id={fileNameId}
          value={fileName}
          maxLength={MAX_FILE_NAME}
          spellCheck={false}
          onChange={(event) => setFileName(event.target.value)}
          className="block h-8 w-full border-b bg-sidebar px-3 font-mono text-xs text-muted-foreground outline-none focus:text-foreground"
        />
        <label htmlFor={contentId} className="sr-only">
          {messages.contentLabel}
        </label>
        <textarea
          id={contentId}
          // biome-ignore lint/a11y/noAutofocus: the popup opens for this field
          autoFocus
          value={content}
          spellCheck={false}
          placeholder={messages.contentPlaceholder}
          onChange={(event) => setContent(event.target.value)}
          className="scrollbar-subtle block h-36 w-full resize-none bg-background px-3 py-2 font-mono text-[13px] leading-5 whitespace-pre outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
        />
      </div>

      {!content && blocks.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-xs text-muted-foreground">{messages.codeOnPage}</h2>
          <ul className="scrollbar-subtle -mx-1 max-h-32 overflow-y-auto">
            {blocks.map((block) => (
              <li key={block.text}>
                <button
                  type="button"
                  onClick={() => fill(block)}
                  className="flex h-8 w-full items-center gap-3 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                    {block.text.split("\n").find((line) => line.trim())}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {messages.lines(block.text.split("\n").length)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>{messages.titleLabel}</Label>
        <Input
          id={titleId}
          value={title}
          maxLength={MAX_TITLE}
          placeholder={messages.titlePlaceholder}
          onChange={(event) => setTitle(event.target.value)}
          className="h-9"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label id={visibilityId}>{messages.visibilityLabel}</Label>
        <SegmentedControl
          aria-labelledby={visibilityId}
          value={visibility}
          onValueChange={setVisibility}
          options={visibilityOptions}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label id={collectionId}>{messages.collectionLabel}</Label>
          <Select
            items={collectionItems}
            value={collection}
            onValueChange={(value) => setCollection(value ?? NO_COLLECTION)}
          >
            <SelectTrigger aria-labelledby={collectionId} className="w-full min-w-0">
              <span className="truncate">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {collectionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label id={expiryId}>{messages.expiresLabel}</Label>
          <Select
            items={expiryItems}
            value={expiry}
            onValueChange={(value) => setExpiry(value ?? "never")}
          >
            <SelectTrigger aria-labelledby={expiryId} className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {expiryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <FormError message={error} />
      <Button type="submit" size="lg" loading={saving} disabled={!content.trim()}>
        {messages.save}
        <Kbd className="pointer-coarse:hidden">{isMac ? "⌘↵" : "Ctrl ↵"}</Kbd>
      </Button>
    </form>
  )
}
