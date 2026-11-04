"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@sniptide/ui/components/dialog"
import { FormError } from "@sniptide/ui/components/form-error"
import { Label } from "@sniptide/ui/components/label"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@sniptide/ui/components/tabs"
import { Textarea } from "@sniptide/ui/components/textarea"
import { toast } from "@sniptide/ui/components/toast"
import { ArrowUpIcon, ImageIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { useResourceLinks } from "@/components/shell/resource-links"
import {
  contextLines,
  githubDraftUrl,
  MAX_DESCRIPTION_LENGTH,
  MAX_SCREENSHOT_BYTES,
  type ReportContext,
  type ReportKind,
  reportMarkdown,
  reportTitle,
  SCREENSHOT_TYPES,
  type SupportSettings,
} from "@/lib/support/report"
import { SupportMarkdown } from "./support-markdown"

type Tab = "ask" | "report"

const SupportContext = React.createContext<{ open: (tab?: Tab) => void } | null>(null)

// Help and feedback: the docs-grounded assistant (when this instance has one) and the bug report
// form, in one dialog opened from the sidebar or the More sheet.
export function SupportProvider({
  settings,
  children,
}: {
  settings: SupportSettings
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<Tab>(settings.assistant ? "ask" : "report")
  // Read when the dialog opens: the page the person is on, never during server rendering.
  const [context, setContext] = React.useState<ReportContext | null>(null)

  const value = React.useMemo(
    () => ({
      open: (next?: Tab) => {
        setContext({
          url: window.location.href,
          browser: navigator.userAgent,
          version: settings.version,
          userId: settings.userId,
          instance: settings.instance,
        })
        if (next) setTab(next)
        setOpen(true)
      },
    }),
    [settings],
  )

  return (
    <SupportContext value={value}>
      {children}
      <SupportDialog
        open={open}
        onOpenChange={setOpen}
        tab={settings.assistant ? tab : "report"}
        onTabChange={setTab}
        settings={settings}
        context={context}
      />
    </SupportContext>
  )
}

// Null outside the app layout (the dev stress page), where the entry points stay hidden.
export function useSupport() {
  return React.useContext(SupportContext)
}

function SupportDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  settings,
  context,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: Tab
  onTabChange: (tab: Tab) => void
  settings: SupportSettings
  context: ReportContext | null
}) {
  const t = useTranslations("Support")
  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogTitle>{t("title")}</DialogTitle>
        {context ? (
          settings.assistant ? (
            <Tabs
              value={tab}
              onValueChange={(value) => onTabChange(value as Tab)}
              className="flex min-h-0 flex-col gap-4"
            >
              <TabsList aria-label={t("title")}>
                <TabsTab value="ask">{t("ask_tab")}</TabsTab>
                <TabsTab value="report">{t("report_tab")}</TabsTab>
              </TabsList>
              {/* Both panels stay mounted so a draft survives switching tabs. */}
              <TabsPanel value="ask" keepMounted className="data-hidden:hidden">
                <AskPanel context={context} onReport={() => onTabChange("report")} />
              </TabsPanel>
              <TabsPanel value="report" keepMounted className="data-hidden:hidden">
                <ReportPanel settings={settings} context={context} onDone={close} />
              </TabsPanel>
            </Tabs>
          ) : (
            <ReportPanel settings={settings} context={context} onDone={close} />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

function AskPanel({ context, onReport }: { context: ReportContext; onReport: () => void }) {
  const t = useTranslations("Support")
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [draft, setDraft] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const id = React.useId()

  // Keep the newest message in view.
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, pending])

  async function send() {
    const question = draft.trim()
    if (!question || pending) return
    // The server accepts 20 messages; drop the oldest exchange to stay under it.
    const history = [...messages, { role: "user" as const, content: question }].slice(-19)
    setMessages(history)
    setDraft("")
    setError(null)
    setPending(true)
    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, url: context.url, browser: context.browser }),
      })
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        reply?: string
        error?: string
      } | null
      if (!response.ok || !body?.ok) {
        setError(body?.error === "rate_limited" ? t("rate_limited") : t("ask_failed"))
        setMessages(messages)
        setDraft(question)
        return
      }
      setMessages([...history, { role: "assistant", content: body.reply || t("ask_refused") }])
    } catch {
      setError(t("ask_failed"))
      setMessages(messages)
      setDraft(question)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={listRef}
        aria-live="polite"
        className="scrollbar-subtle flex max-h-[min(22rem,45dvh)] min-h-32 flex-col gap-3 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ask_empty")}</p>
        ) : (
          messages.map((message, index) =>
            message.role === "user" ? (
              <div
                key={index}
                className="max-w-[85%] self-end rounded-lg bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap"
              >
                <span className="sr-only">{t("you")}: </span>
                {message.content}
              </div>
            ) : (
              <div key={index} className="flex flex-col gap-2 text-sm leading-5 break-words">
                <span className="sr-only">{t("assistant")}: </span>
                <SupportMarkdown text={message.content} />
              </div>
            ),
          )
        )}
        {pending ? (
          <p className="text-sm text-muted-foreground motion-safe:animate-pulse">{t("thinking")}</p>
        ) : null}
      </div>
      <FormError message={error} variant="inline" />
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <Label htmlFor={`${id}-question`} className="sr-only">
          {t("ask_label")}
        </Label>
        <div className="relative">
          <Textarea
            id={`${id}-question`}
            value={draft}
            maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder={t("ask_placeholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
            className="min-h-20 resize-none pr-12"
          />
          <Button
            type="submit"
            size="icon"
            aria-label={t("send")}
            disabled={!draft.trim() || pending}
            loading={pending}
            className="absolute right-2 bottom-2"
          >
            <ArrowUpIcon />
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {t.rich("ask_notice", {
            report: (chunks) => (
              <button
                type="button"
                onClick={onReport}
                className="text-link underline underline-offset-2"
              >
                {chunks}
              </button>
            ),
          })}
        </p>
      </form>
    </div>
  )
}

function ReportPanel({
  settings,
  context,
  onDone,
}: {
  settings: SupportSettings
  context: ReportContext
  onDone: () => void
}) {
  const t = useTranslations("Support")
  const links = useResourceLinks()
  const [kind, setKind] = React.useState<ReportKind>("bug")
  const [description, setDescription] = React.useState("")
  const [screenshot, setScreenshot] = React.useState<File | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const id = React.useId()
  const direct = settings.reports === "linear"

  function pickScreenshot(file: File | undefined | null) {
    if (!file) return
    if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type)) {
      setError(t("screenshot_type"))
      return
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError(t("screenshot_too_large"))
      return
    }
    setError(null)
    setScreenshot(file)
  }

  function reset() {
    setDescription("")
    setScreenshot(null)
    setError(null)
    setKind("bug")
  }

  async function submit() {
    if (!description.trim() || pending) return
    if (!direct) {
      const href = githubDraftUrl(
        links.help,
        reportTitle(kind, description),
        reportMarkdown({ kind, description, context }),
      )
      if (href) {
        window.open(href, "_blank", "noopener,noreferrer")
      } else if (links.help.includes("github.com")) {
        setError(t("link_too_long"))
        return
      } else {
        window.open(links.help, "_blank", "noopener,noreferrer")
      }
      reset()
      onDone()
      return
    }

    const form = new FormData()
    form.set("kind", kind)
    form.set("description", description)
    form.set("url", context.url)
    form.set("browser", context.browser)
    if (screenshot) form.set("screenshot", screenshot)
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/support/report", { method: "POST", body: form })
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
      } | null
      if (!response.ok || !body?.ok) {
        setError(
          body?.error === "rate_limited"
            ? t("rate_limited")
            : body?.error === "too_large"
              ? t("screenshot_too_large")
              : t("report_failed"),
        )
        return
      }
      toast.success(t("report_sent"))
      reset()
      onDone()
    } catch {
      setError(t("report_failed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <DialogDescription>{direct ? t("report_notice") : t("link_notice")}</DialogDescription>
      <SegmentedControl
        aria-label={t("kind_label")}
        value={kind}
        onValueChange={setKind}
        options={[
          { value: "bug", label: t("kind_bug") },
          { value: "feedback", label: t("kind_feedback") },
        ]}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-description`}>
          {kind === "bug" ? t("description_bug") : t("description_feedback")}
        </Label>
        <Textarea
          id={`${id}-description`}
          required
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onPaste={(event) => {
            if (!direct) return
            const image = [...event.clipboardData.files].find((file) =>
              file.type.startsWith("image/"),
            )
            if (image) {
              event.preventDefault()
              pickScreenshot(image)
            }
          }}
          rows={5}
        />
      </div>
      {direct ? (
        <div className="flex flex-col gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept={SCREENSHOT_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              pickScreenshot(event.target.files?.[0])
              event.target.value = ""
            }}
          />
          {screenshot ? (
            <div className="flex h-10 items-center gap-2 rounded-lg border border-border pr-1 pl-3 text-sm">
              <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{screenshot.name || t("screenshot")}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("screenshot_remove")}
                onClick={() => setScreenshot(null)}
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon />
              {t("screenshot_add")}
            </Button>
          )}
          <p className="text-[13px] text-muted-foreground">{t("screenshot_hint")}</p>
        </div>
      ) : null}
      <details className="group text-sm">
        <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
          {t("details")}
        </summary>
        <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all text-muted-foreground">
          {contextLines(context).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      <FormError message={error} variant="inline" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!description.trim()} loading={pending}>
          {direct
            ? t("send_report")
            : githubDraftUrl(links.help, "", "")
              ? t("continue_github")
              : t("continue_help")}
        </Button>
      </div>
    </form>
  )
}
