"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@sniptide/ui/components/alert-dialog"
import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { Textarea } from "@sniptide/ui/components/textarea"
import { toast } from "@sniptide/ui/components/toast"
import { ChevronLeftIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { PageHeader } from "@/components/page-header"
import {
  deleteBroadcastDraft,
  previewBroadcast,
  saveBroadcastDraft,
  sendBroadcastTest,
  sendBroadcastToSubscribers,
} from "@/lib/actions"
import type { BroadcastContent } from "@/lib/compose"
import { formatDate, people } from "@/lib/format"
import type { BroadcastError } from "@/lib/store"

type SaveState = "idle" | "saving" | "saved" | "failed"

const ERRORS: Record<BroadcastError, string> = {
  notFound: "This update no longer exists.",
  alreadySent: "This update was already sent, so it can't change.",
  noSubject: "Add a subject before sending.",
  noBody: "Write the update before sending.",
  noOperator: "Set OPERATOR_NAME and OPERATOR_ADDRESS so the email names its sender.",
  testFailed: "Couldn't send the test email. Try again in a minute.",
  sendFailed: "Couldn't send the update. Nothing went out, so try again in a minute.",
  signedOut: "Your session ended. Sign in again and retry.",
}

// Saving waits for a pause in typing so a draft is written about once per thought.
const SAVE_DELAY = 600

export function BroadcastEditor({
  id,
  initial,
  initialHtml,
  subscribers,
  email,
  sent,
}: {
  id: string
  initial: BroadcastContent
  initialHtml: string
  subscribers: number
  email: string
  sent: { at: string; recipients: number | null } | null
}) {
  const router = useRouter()
  const fieldId = useId()
  const [content, setContent] = useState(initial)
  const [html, setHtml] = useState(initialHtml)
  const [save, setSave] = useState<SaveState>("idle")
  const [confirmSend, setConfirmSend] = useState(false)
  const [testing, startTest] = useTransition()
  const [sending, startSend] = useTransition()
  const [deleting, startDelete] = useTransition()
  const latest = useRef(content)
  const dirty = useRef(false)

  const readOnly = sent !== null

  useEffect(() => {
    if (!dirty.current) return
    const handle = setTimeout(async () => {
      const snapshot = latest.current
      setSave("saving")
      const [result, preview] = await Promise.all([
        saveBroadcastDraft(id, snapshot).catch(() => null),
        previewBroadcast(snapshot).catch(() => null),
      ])
      if (preview !== null) setHtml(preview)
      if (latest.current !== snapshot) return
      setSave(result?.ok ? "saved" : "failed")
      if (result?.ok) dirty.current = false
    }, SAVE_DELAY)
    return () => clearTimeout(handle)
  }, [content, id])

  function update(patch: Partial<BroadcastContent>) {
    const next = { ...latest.current, ...patch }
    latest.current = next
    dirty.current = true
    setContent(next)
  }

  function errorMessage(code: BroadcastError) {
    return ERRORS[code]
  }

  // Sends read the stored draft, so a pending edit is written first.
  async function flush() {
    if (!dirty.current) return true
    const result = await saveBroadcastDraft(id, latest.current).catch(() => null)
    if (!result?.ok) {
      toast.error(
        result
          ? errorMessage(result.error)
          : "Couldn't save. Your changes stay on this page, so try again.",
      )
      return false
    }
    dirty.current = false
    setSave("saved")
    return true
  }

  function sendTest() {
    startTest(async () => {
      if (!(await flush())) return
      const result = await sendBroadcastTest(id).catch(() => null)
      if (result?.ok) toast.success(`Test sent to ${email}`)
      else toast.error(errorMessage(result ? result.error : "testFailed"))
    })
  }

  function sendToSubscribers() {
    startSend(async () => {
      if (!(await flush())) return
      const result = await sendBroadcastToSubscribers(id).catch(() => null)
      setConfirmSend(false)
      if (!result?.ok) {
        toast.error(errorMessage(result ? result.error : "sendFailed"))
        return
      }
      toast.success("Update sent")
      router.refresh()
    })
  }

  function remove() {
    startDelete(async () => {
      const result = await deleteBroadcastDraft(id).catch(() => null)
      if (!result?.ok) {
        toast.error(errorMessage(result ? result.error : "notFound"))
        return
      }
      toast.success("Draft deleted")
      router.replace("/")
    })
  }

  const field = (name: string) => `${fieldId}-${name}`
  const sentDate = sent ? formatDate(new Date(sent.at), "long") : ""

  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1 text-sm text-link hover:underline"
        >
          <ChevronLeftIcon aria-hidden className="size-4" />
          Product updates
        </Link>
        <PageHeader
          title={content.subject || "Untitled update"}
          description={
            readOnly ? undefined : (
              <span aria-live="polite">
                {save === "saving"
                  ? "Saving…"
                  : save === "saved"
                    ? "Saved"
                    : save === "failed"
                      ? "Couldn't save. Your changes stay on this page, so try again."
                      : null}
              </span>
            )
          }
        />
      </div>

      {sent ? (
        <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          {sent.recipients === null
            ? `Sent on ${sentDate}.`
            : `Sent on ${sentDate} to ${people(sent.recipients)}.`}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          className="flex min-w-0 max-w-[560px] flex-col gap-5"
          onSubmit={(event) => event.preventDefault()}
        >
          <fieldset disabled={readOnly} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor={field("subject")}>Subject</Label>
              <Input
                id={field("subject")}
                value={content.subject}
                maxLength={200}
                onChange={(event) => update({ subject: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={field("preview")}>Preview text</Label>
              <Input
                id={field("preview")}
                value={content.preview}
                maxLength={300}
                aria-describedby={field("preview-hint")}
                onChange={(event) => update({ preview: event.target.value })}
              />
              <p id={field("preview-hint")} className="text-[13px] text-muted-foreground">
                Shown next to the subject in the inbox.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={field("label")}>Cover label</Label>
              <Input
                id={field("label")}
                value={content.label}
                maxLength={60}
                onChange={(event) => update({ label: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={field("image")}>Screenshot link</Label>
              <Input
                id={field("image")}
                type="url"
                inputMode="url"
                value={content.imageUrl ?? ""}
                maxLength={2000}
                placeholder="https://"
                aria-describedby={field("image-hint")}
                onChange={(event) => update({ imageUrl: event.target.value || null })}
              />
              <p id={field("image-hint")} className="text-[13px] text-muted-foreground">
                An https link to an image at least 700px wide. Leave it empty for a cover without a
                screenshot.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={field("body")}>Update</Label>
              <Textarea
                id={field("body")}
                value={content.body}
                maxLength={50000}
                rows={16}
                aria-describedby={field("body-hint")}
                className="min-h-80 font-mono text-[13px] leading-5"
                onChange={(event) => update({ body: event.target.value })}
              />
              <p id={field("body-hint")} className="text-[13px] text-muted-foreground">
                Write in Markdown: ## for a heading, - for a list item and
                [text](https://example.com) for a link.
              </p>
            </div>
          </fieldset>

          {readOnly ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" loading={testing} onClick={sendTest}>
                Send test
              </Button>
              <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
                <AlertDialogTrigger render={<Button type="button" />}>
                  Send to subscribers
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Send this update?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {subscribers === 0
                      ? "No one has turned on product updates yet, so it reaches no one. You can't edit it afterwards."
                      : `It goes to ${people(subscribers)} right away, and you can't edit it afterwards.`}
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogClose render={<Button type="button" variant="outline" size="lg" />}>
                      Cancel
                    </AlertDialogClose>
                    <Button type="button" size="lg" loading={sending} onClick={sendToSubscribers}>
                      Send now
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button type="button" variant="ghost" className="text-destructive" />}
                >
                  Delete draft
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                  <AlertDialogDescription>The draft is deleted for good.</AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogClose render={<Button type="button" variant="outline" size="lg" />}>
                      Cancel
                    </AlertDialogClose>
                    <Button
                      type="button"
                      size="lg"
                      variant="destructive"
                      loading={deleting}
                      onClick={remove}
                    >
                      Delete draft
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </form>

        <section aria-label={"Email preview"} className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <iframe
            title={"Email preview"}
            srcDoc={html}
            sandbox=""
            className="rounded-lg h-[640px] w-full border border-border bg-white lg:h-[calc(100dvh-8rem)]"
          />
        </section>
      </div>
    </div>
  )
}
