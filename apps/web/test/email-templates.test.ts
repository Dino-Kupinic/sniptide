import { describe, expect, test } from "bun:test"
import {
  approveEmailChange,
  type EmailContent,
  notificationEmail,
  resetPassword,
  senderLine,
  verifyEmail,
} from "@/lib/email/content"
import { requestLocale } from "@/lib/email/locale"
import { emailText, renderEmail } from "@/lib/email/render"
import { locales } from "@/lib/i18n/config"
import { NOTIFICATION_KINDS } from "@/lib/notifications/types"

const operator = { name: "Example GmbH", address: "Ring 1\n 1010 Wien\nAustria" }
const link = "https://paste.example.com/api/auth/verify-email?token=abc.def&callbackURL=%2F"

const appUrl = "https://paste.example.com"

function build(locale: (typeof locales)[number]): Record<string, EmailContent> {
  const common = { to: "dana@example.com", appUrl, operator, locale }
  return {
    verify: verifyEmail({ ...common, url: link }),
    change: approveEmailChange({ ...common, newEmail: "dana@new.example.com", url: link }),
    reset: resetPassword({ ...common, operator: undefined, url: link }),
    ...Object.fromEntries(
      NOTIFICATION_KINDS.map((kind) => [
        kind,
        notificationEmail({
          ...common,
          kind,
          url: `${appUrl}/shared`,
          settingsUrl: `${appUrl}/settings?tab=notifications`,
          unsubscribeUrl: `${appUrl}/api/notifications/unsubscribe?token=t`,
        }),
      ]),
    ),
  }
}

const emails = build("en")
const everyLocale = locales.flatMap((locale) =>
  Object.entries(build(locale)).map(([name, content]) => [`${locale} ${name}`, content] as const),
)

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
  for (const [name, content] of everyLocale) {
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
      // The plain text shows the URL itself, so only the HTML needs the line about the button.
      expect(shown).toContain(content.buttonFallback)
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
      expect(content.preview.length).toBeGreaterThan(8)
      expect(visible(await renderEmail(content).then((r) => r.html))).toContain(content.preview)
    })

    test(`${name}: follows the copy rules`, () => {
      const words = emailText(content) + content.subject + content.preview
      expect(words).not.toMatch(/—|SnipTide|Read more|Click here/)
    })
  }

  test("the HTML declares light and dark support and swaps the logo", async () => {
    const { html } = await renderEmail(emails.verify as EmailContent)
    expect(html).toContain('name="color-scheme" content="light dark"')
    expect(html).toContain("@media (prefers-color-scheme: dark)")
    expect(html).toContain('lang="en"')
    expect(html).toContain(`src="${appUrl}/email/sniptide-logo.png"`)
    expect(html).toContain(`src="${appUrl}/email/sniptide-logo-dark.png"`)
    expect(html).toContain('alt="Sniptide"')
  })

  test("without an app URL the name stands in for the logo", async () => {
    const { html } = await renderEmail(verifyEmail({ to: "dana@example.com", url: link }))
    expect(html).not.toContain("<img")
    expect(visible(html)).toContain("Sniptide")
  })

  test("each language renders in its own words and sets the document language", async () => {
    const subjects = new Set<string>()
    for (const locale of locales) {
      const content = build(locale).verify as EmailContent
      subjects.add(content.subject)
      const { html, text } = await renderEmail(content)
      expect(html).toContain(`lang="${locale}"`)
      expect(text).toContain("dana@example.com")
      expect(text).toContain(link)
    }
    expect(subjects.size).toBe(locales.length)
    expect(build("de").shared?.subject).toBe("Ein Snippet wurde mit dir geteilt")
    expect(build("ja").reset?.heading).toBe("パスワードを再設定してください")
  })

  test("the language comes from the saved choice, then the browser", async () => {
    const ask = (headers: Record<string, string>) =>
      requestLocale(new Request("https://paste.example.com", { headers }))
    expect(await ask({ cookie: "theme=dark; sniptide-locale=ja" })).toBe("ja")
    expect(await ask({ cookie: "sniptide-locale=ja", "accept-language": "de" })).toBe("ja")
    expect(await ask({ "accept-language": "es-MX,en;q=0.5" })).toBe("es")
    expect(await ask({ cookie: "sniptide-locale=fr" })).toBe("en")
  })

  test("notification emails leave out paste details and offer a way out", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const text = emailText(emails[kind] as EmailContent)
      expect(text).toContain("Stop these emails:")
      expect(text).toContain("Notification settings:")
      expect(text).toContain("leaves out their titles, links and contents")
      expect(text).toContain("Sent by Example GmbH")
    }
  })

  test("the sender line names the operator and a one-line postal address", () => {
    expect(senderLine(operator)).toBe("Sent by Example GmbH, Ring 1, 1010 Wien, Austria.")
    expect(senderLine({ name: "Example GmbH" })).toBe("Sent by Example GmbH.")
    expect(senderLine(undefined)).toBeUndefined()
    expect(senderLine({ name: "Example GmbH" }, "de")).toBe("Gesendet von Example GmbH.")
    expect(emailText(emails.reset as EmailContent)).not.toContain("Sent by")
  })
})
