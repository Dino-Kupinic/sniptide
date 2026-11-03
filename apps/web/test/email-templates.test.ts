import { describe, expect, test } from "bun:test"
import {
  approveEmailChange,
  type EmailContent,
  notificationEmail,
  resetPassword,
  senderLine,
  verifyEmail,
} from "@/lib/email/content"
import { emailText, renderEmail } from "@/lib/email/render"
import { NOTIFICATION_KINDS } from "@/lib/notifications/types"

const operator = { name: "Example GmbH", address: "Ring 1\n 1010 Wien\nAustria" }
const link = "https://paste.example.com/api/auth/verify-email?token=abc.def&callbackURL=%2F"

const emails: Record<string, EmailContent> = {
  verify: verifyEmail({ to: "dana@example.com", url: link, operator }),
  change: approveEmailChange({
    to: "dana@example.com",
    newEmail: "dana@new.example.com",
    url: link,
    operator,
  }),
  reset: resetPassword({ to: "dana@example.com", url: link }),
  ...Object.fromEntries(
    NOTIFICATION_KINDS.map((kind) => [
      kind,
      notificationEmail({
        kind,
        to: "dana@example.com",
        url: "https://paste.example.com/shared",
        settingsUrl: "https://paste.example.com/settings?tab=notifications",
        unsubscribeUrl: "https://paste.example.com/api/notifications/unsubscribe?token=t",
        operator,
      }),
    ]),
  ),
}

// What a reader sees in the HTML part, without markup, entities or the hidden preheader filler.
function visible(html: string) {
  return html
    .replace(/<head>[\s\S]*?<\/head>/, "")
    .replace(/<\/?(strong|span)\b[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;| |‌|​|⠀|͏|﻿/g, " ")
    .replace(/\s+/g, " ")
}

describe("transactional emails", () => {
  for (const [name, content] of Object.entries(emails)) {
    test(`${name}: HTML and plain text carry the same words and links`, async () => {
      const { subject, html, text } = await renderEmail(content)
      expect(subject).toBe(content.subject)
      const shown = visible(html)
      const plain = text.replace(/\s+/g, " ")
      const sentences = [
        content.heading,
        ...content.body.map((p) => p.map((s) => (typeof s === "string" ? s : s.strong)).join("")),
        ...(content.after ?? []).map((p) =>
          p.map((s) => (typeof s === "string" ? s : s.strong)).join(""),
        ),
        content.action.label,
        content.note,
        content.footer.reason,
        content.footer.sender,
        ...(content.footer.links ?? []).map((l) => l.label),
      ].filter((value): value is string => Boolean(value))
      for (const sentence of sentences) {
        expect(shown).toContain(sentence)
        expect(plain).toContain(sentence)
      }
      for (const href of [
        content.action.href,
        ...(content.footer.links ?? []).map((l) => l.href),
      ]) {
        expect(html).toContain(`href="${href.replace(/&/g, "&amp;")}"`)
        expect(text).toContain(href)
      }
    })

    test(`${name}: the preheader adds context instead of repeating the subject`, async () => {
      expect(content.preview).not.toBe(content.subject)
      expect(content.preview.length).toBeGreaterThan(20)
      expect(visible(await renderEmail(content).then((r) => r.html))).toContain(content.preview)
    })

    test(`${name}: follows the copy rules`, () => {
      const words = emailText(content) + content.subject + content.preview
      expect(words).not.toMatch(/—|SnipTide|Read more|Click here/)
    })
  }

  test("the HTML declares light and dark support and switches palettes", async () => {
    const { html } = await renderEmail(emails.verify as EmailContent)
    expect(html).toContain('name="color-scheme" content="light dark"')
    expect(html).toContain("@media (prefers-color-scheme: dark)")
    expect(html).toContain('lang="en"')
  })

  test("notification emails leave out paste details and offer a way out", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const text = emailText(emails[kind] as EmailContent)
      expect(text).toContain("Stop these emails:")
      expect(text).toContain("Notification settings:")
      expect(text).toContain("leaves out their titles, links and contents")
    }
  })

  test("the sender line names the operator and a one-line postal address", () => {
    expect(senderLine(operator)).toBe("Sent by Example GmbH, Ring 1, 1010 Wien, Austria.")
    expect(senderLine({ name: "Example GmbH" })).toBe("Sent by Example GmbH.")
    expect(senderLine(undefined)).toBeUndefined()
    expect(emailText(emails.reset as EmailContent)).not.toContain("Sent by")
  })
})
