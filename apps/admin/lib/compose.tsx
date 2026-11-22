import { render } from "@react-email/render"
import { Action, Broadcast, Cover, MarkdownBody, type Operator, Rating } from "./email"
import { type EmailKind, KINDS } from "./kinds"

// The fields only some kinds use. A survey links to its form and can ask one question with a
// one-click rating; a guide names its full version and how long it takes to read.
export type EmailDetails = {
  heading?: string
  url?: string
  buttonLabel?: string
  question?: string
  minutes?: number
}

// What a writer fills in for one email. The rest (logo, header, footer, unsubscribe link) comes
// from the broadcast layout.
export interface BroadcastContent {
  kind: EmailKind
  subject: string
  preview: string
  label: string
  imageUrl: string | null
  body: string
  details: EmailDetails
}

// The words a kind uses when the writer leaves a field empty.
export const FALLBACKS = {
  surveyHeading: "Help shape Sniptide",
  surveyButton: "Take the survey",
  guideLabel: "Guide",
  guideButton: "Read the full guide",
}

// "November 2026": the cover label a new product update starts with.
export function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

function issueDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

// Only https links load in mail clients without a warning, so anything else is left out. Local
// addresses pass so a development instance can preview its own images.
export function safeUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.hostname === "localhost" ? url.href : null
  } catch {
    return null
  }
}

function minutesNote(minutes: number | undefined, unit: "survey" | "guide") {
  if (!minutes) return undefined
  if (unit === "guide") return `${minutes} min read`
  return minutes === 1 ? "It takes about a minute." : `It takes about ${minutes} minutes.`
}

function Content({ content, appUrl }: { content: BroadcastContent; appUrl?: string }) {
  const { details } = content
  const url = safeUrl(details.url)
  switch (content.kind) {
    case "survey":
      return (
        <>
          <MarkdownBody>{content.body}</MarkdownBody>
          {url && details.question?.trim() ? (
            <Rating question={details.question.trim()} url={url} />
          ) : null}
          {url ? (
            <Action
              href={url}
              label={details.buttonLabel?.trim() || FALLBACKS.surveyButton}
              note={minutesNote(details.minutes, "survey")}
            />
          ) : null}
        </>
      )
    case "guide":
      return (
        <>
          <MarkdownBody>{content.body}</MarkdownBody>
          {url ? (
            <Action href={url} label={details.buttonLabel?.trim() || FALLBACKS.guideButton} />
          ) : null}
        </>
      )
    default: {
      const image = safeUrl(content.imageUrl)
      return (
        <>
          <Cover
            appUrl={appUrl}
            label={content.label || undefined}
            title="Product updates"
            image={image ? { src: image, alt: "" } : undefined}
          />
          <MarkdownBody>{content.body}</MarkdownBody>
        </>
      )
    }
  }
}

// The title and the muted line under it for each kind.
function header(content: BroadcastContent, date: Date) {
  const heading = content.details.heading?.trim()
  switch (content.kind) {
    case "survey":
      return { title: heading || FALLBACKS.surveyHeading, meta: undefined }
    case "guide":
      return {
        title: heading || content.subject || "Untitled guide",
        meta: [
          content.label.trim() || FALLBACKS.guideLabel,
          minutesNote(content.details.minutes, "guide"),
        ]
          .filter(Boolean)
          .join(" · "),
      }
    default:
      return { title: "Sniptide product updates", meta: issueDate(date) }
  }
}

export function BroadcastEmail({
  content,
  date,
  appUrl,
  operator,
}: {
  content: BroadcastContent
  date: Date
  appUrl?: string
  operator?: Operator
}) {
  return (
    <Broadcast
      subject={content.subject}
      preview={content.preview}
      {...header(content, date)}
      audience={KINDS[content.kind].audience}
      appUrl={appUrl}
      operator={operator}
    >
      <Content content={content} appUrl={appUrl} />
    </Broadcast>
  )
}

export async function renderBroadcastEmail(input: Parameters<typeof BroadcastEmail>[0]) {
  const element = <BroadcastEmail {...input} />
  return {
    subject: input.content.subject,
    html: await render(element),
    // Headings keep their case in the plain-text part instead of html-to-text's capitals.
    text: await render(element, {
      plainText: true,
      htmlToTextOptions: {
        selectors: ["h1", "h2", "h3"].map((selector) => ({
          selector,
          options: { uppercase: false },
        })),
      },
    }),
  }
}
