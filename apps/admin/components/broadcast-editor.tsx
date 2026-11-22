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
import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from "react"
import { BackLink } from "@/components/back-link"
import { PageHeader } from "@/components/page-header"
import {
  deleteBroadcastDraft,
  previewBroadcast,
  saveBroadcastDraft,
  sendBroadcastTest,
  sendBroadcastToSubscribers,
} from "@/lib/actions"
import type { BroadcastContent, EmailDetails } from "@/lib/compose"
import { formatDate, people } from "@/lib/format"
import { KINDS } from "@/lib/kinds"
import type { BroadcastError } from "@/lib/store"

type SaveState = "idle" | "saving" | "saved" | "failed"

const ERRORS: Record<BroadcastError, string> = {
  notFound: "This email no longer exists.",
  alreadySent: "This email was already sent, so it can't change.",
  noSubject: "Add a subject before sending.",
  noBody: "Write the email before sending.",
  noUrl: "Add an https link to the survey before sending.",
  noOperator: "Set OPERATOR_NAME and OPERATOR_ADDRESS so the email names its sender.",
  testFailed: "Couldn't send the test email. Try again in a minute.",
  sendFailed: "Couldn't send the email. Nothing went out, so try again in a minute.",
  signedOut: "Your session ended. Sign in again and retry.",
}

const MARKDOWN_HINT =
  "Write in Markdown: ## for a heading, - for a list item and [text](https://example.com) for a link."

// One labeled control with an optional hint under it.
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
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

  function updateDetails(patch: Partial<EmailDetails>) {
    update({ details: { ...latest.current.details, ...patch } })
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
      toast.success("Email sent")
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
      router.replace("/emails")
    })
  }

  const field = (name: string) => `${fieldId}-${name}`
  const sentDate = sent ? formatDate(new Date(sent.at), "long") : ""

  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <div className="flex flex-col gap-3">
        <BackLink href="/emails" label="Emails" />
        <PageHeader
          title={content.subject || KINDS[content.kind].untitled}
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
            <p className="text-sm text-muted-foreground">{KINDS[content.kind].name}</p>
            <Field id={field("subject")} label="Subject">
              <Input
                id={field("subject")}
                value={content.subject}
                maxLength={200}
                onChange={(event) => update({ subject: event.target.value })}
              />
            </Field>
            <Field
              id={field("preview")}
              label="Preview text"
              hint="Shown next to the subject in the inbox."
            >
              <Input
                id={field("preview")}
                value={content.preview}
                maxLength={300}
                aria-describedby={field("preview-hint")}
                onChange={(event) => update({ preview: event.target.value })}
              />
            </Field>
            {content.kind === "update" ? (
              <>
                <Field id={field("label")} label="Cover label">
                  <Input
                    id={field("label")}
                    value={content.label}
                    maxLength={60}
                    onChange={(event) => update({ label: event.target.value })}
                  />
                </Field>
                <Field
                  id={field("image")}
                  label="Screenshot link"
                  hint="An https link to an image at least 700px wide. Leave it empty for a cover without a screenshot."
                >
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
                </Field>
              </>
            ) : (
              <Field
                id={field("heading")}
                label={content.kind === "guide" ? "Title" : "Heading"}
                hint={
                  content.kind === "guide"
                    ? "The large title at the top. Leave it empty to use the subject."
                    : "The large title at the top of the email."
                }
              >
                <Input
                  id={field("heading")}
                  value={content.details.heading ?? ""}
                  maxLength={120}
                  aria-describedby={field("heading-hint")}
                  onChange={(event) => updateDetails({ heading: event.target.value })}
                />
              </Field>
            )}
            {content.kind === "guide" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={field("label")} label="Topic">
                  <Input
                    id={field("label")}
                    value={content.label}
                    maxLength={60}
                    onChange={(event) => update({ label: event.target.value })}
                  />
                </Field>
                <Field id={field("minutes")} label="Reading time in minutes">
                  <Input
                    id={field("minutes")}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                    value={content.details.minutes ?? ""}
                    onChange={(event) =>
                      updateDetails({ minutes: Number(event.target.value) || undefined })
                    }
                  />
                </Field>
              </div>
            ) : null}
            <Field
              id={field("body")}
              label={
                content.kind === "update"
                  ? "Update"
                  : content.kind === "guide"
                    ? "Guide"
                    : "Message"
              }
              hint={MARKDOWN_HINT}
            >
              <Textarea
                id={field("body")}
                value={content.body}
                maxLength={50000}
                rows={content.kind === "survey" ? 8 : 16}
                aria-describedby={field("body-hint")}
                className={
                  content.kind === "survey"
                    ? "min-h-40 font-mono text-[13px] leading-5"
                    : "min-h-80 font-mono text-[13px] leading-5"
                }
                onChange={(event) => update({ body: event.target.value })}
              />
            </Field>
            {content.kind === "survey" ? (
              <Field
                id={field("question")}
                label="Rating question"
                hint="Optional. Shows scores from 1 to 5 under the question. Each score opens the survey link with the score added as rating."
              >
                <Input
                  id={field("question")}
                  value={content.details.question ?? ""}
                  maxLength={200}
                  placeholder="How likely are you to recommend Sniptide?"
                  aria-describedby={field("question-hint")}
                  onChange={(event) => updateDetails({ question: event.target.value })}
                />
              </Field>
            ) : null}
            {content.kind === "update" ? null : (
              <>
                <Field
                  id={field("url")}
                  label={content.kind === "survey" ? "Survey link" : "Full guide link"}
                  hint={
                    content.kind === "survey"
                      ? "An https link to the form, such as a Tally or Typeform survey."
                      : "Optional. An https link to the full guide, shown as a button."
                  }
                >
                  <Input
                    id={field("url")}
                    type="url"
                    inputMode="url"
                    value={content.details.url ?? ""}
                    maxLength={2000}
                    placeholder="https://"
                    aria-describedby={field("url-hint")}
                    onChange={(event) => updateDetails({ url: event.target.value })}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id={field("button")} label="Button label">
                    <Input
                      id={field("button")}
                      value={content.details.buttonLabel ?? ""}
                      maxLength={40}
                      onChange={(event) => updateDetails({ buttonLabel: event.target.value })}
                    />
                  </Field>
                  {content.kind === "survey" ? (
                    <Field id={field("minutes")} label="Minutes to answer">
                      <Input
                        id={field("minutes")}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={120}
                        value={content.details.minutes ?? ""}
                        onChange={(event) =>
                          updateDetails({ minutes: Number(event.target.value) || undefined })
                        }
                      />
                    </Field>
                  ) : null}
                </div>
              </>
            )}
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
                  <AlertDialogTitle>Send this email?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {subscribers === 0
                      ? `No one has turned on ${KINDS[content.kind].audience} yet, so it reaches no one. You can't edit it afterwards.`
                      : `It goes right away to the ${people(subscribers)} who turned on ${KINDS[content.kind].audience}, and you can't edit it afterwards.`}
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
