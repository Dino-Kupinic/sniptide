import { render } from "@react-email/render"
import { Broadcast, Cover, MarkdownBody, type Operator } from "./email"

// What a writer fills in for one product update. The rest of the email (logo, header, footer,
// unsubscribe link) comes from the broadcast layout.
export interface BroadcastContent {
  subject: string
  preview: string
  label: string
  imageUrl: string | null
  body: string
}

const BROADCAST_TITLE = "Sniptide product updates"

// "November 2026": the cover label a new draft starts with.
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

// Only https images load in mail clients without a warning, so anything else is left out.
export function safeImageUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.hostname === "localhost" ? url.href : null
  } catch {
    return null
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
  const image = safeImageUrl(content.imageUrl)
  return (
    <Broadcast
      subject={content.subject}
      preview={content.preview}
      title={BROADCAST_TITLE}
      date={issueDate(date)}
      appUrl={appUrl}
      operator={operator}
    >
      <Cover
        appUrl={appUrl}
        label={content.label || undefined}
        title="Product updates"
        image={image ? { src: image, alt: "" } : undefined}
      />
      <MarkdownBody>{content.body}</MarkdownBody>
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
