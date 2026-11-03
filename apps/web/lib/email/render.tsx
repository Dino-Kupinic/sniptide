import { render } from "@react-email/render"
import type { EmailContent, Paragraph } from "./content"
import { EmailLayout } from "./layout"

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

function line(paragraph: Paragraph) {
  return paragraph
    .map((segment) => (typeof segment === "string" ? segment : segment.strong))
    .join("")
}

// The plain-text part, written from the same content as the HTML so both say the same things in
// the same order: heading, body, the action with its full URL, the note and the footer.
export function emailText(content: EmailContent) {
  const { heading, body, action, after, note, footer } = content
  const blocks = [
    heading,
    ...body.map(line),
    `${action.label}:\n${action.href}`,
    ...(after ?? []).map(line),
    note,
    "--",
    footer.reason,
    ...(footer.links ?? []).map((link) => `${link.label}:\n${link.href}`),
    footer.sender,
  ]
  return `${blocks.filter(Boolean).join("\n\n")}\n`
}

export async function renderEmail(content: EmailContent): Promise<RenderedEmail> {
  return {
    subject: content.subject,
    html: await render(<EmailLayout content={content} />),
    text: emailText(content),
  }
}
