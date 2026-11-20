import { createTranslator } from "next-intl"
import { defaultLocale, type Locale } from "@/lib/i18n/config"
import type { NotificationKind } from "@/lib/notifications/types"
import de from "@/messages/de/email.json"
import en from "@/messages/en/email.json"
import es from "@/messages/es/email.json"
import ja from "@/messages/ja/email.json"
import zh from "@/messages/zh/email.json"

const catalogs = { en, de, es, ja, zh }

// One run of text in a paragraph. `strong` sets an address or name the reader should check apart
// from the sentence around it.
type Segment = string | { strong: string }
export type Paragraph = Segment[]

interface EmailLink {
  label: string
  href: string
}

// Everything one email says, written once. The HTML layout and the plain-text version both render
// from it, so the two always carry the same sentences, links and footer.
export interface EmailContent {
  locale: Locale
  subject: string
  // The preheader: the line inbox lists show after the subject. It adds context and never repeats
  // the subject.
  preview: string
  // The Sniptide lockup, served by this instance. Without an app URL the email shows the name as
  // text instead.
  logo?: { light: string; dark: string; alt: string }
  // The folder this instance serves the Archivo and Inter files from, for clients that load web
  // fonts. The others use the system fonts in the stack.
  fontsUrl?: string
  heading: string
  body: Paragraph[]
  action: EmailLink
  // The sentence above the action's full URL, for links that carry a token the reader can't find
  // another way. Emails whose action is a plain page of the app leave it out.
  buttonFallback?: string
  // Things to try next, each a linked title over one sentence, after the action.
  steps?: (EmailLink & { body: string })[]
  // Paragraphs after the action, such as what happens once the reader follows it.
  after?: Paragraph[]
  // Who should ignore the email, in muted text below the action.
  note?: string
  footer: {
    reason: string
    links?: EmailLink[]
    sender?: string
  }
}

export interface Operator {
  name: string
  address?: string
}

interface Common {
  to: string
  // The instance's public URL, which serves the logo images.
  appUrl?: string
  operator?: Operator
  locale?: Locale
}

function translator(locale: Locale) {
  return createTranslator({ locale, messages: catalogs[locale], namespace: "Email" })
}

type Translator = ReturnType<typeof translator>

const open = "\u0001"
const close = "\u0002"

// Turns a message with <b> tags into segments, so the HTML can set the tagged part in bold and the
// plain text can keep it as is.
function paragraph(t: Translator, key: Parameters<Translator["markup"]>[0], values = {}) {
  const marked = t.markup(key, { ...values, b: (chunks) => `${open}${chunks}${close}` })
  return marked
    .split(new RegExp(`(${open}[^${close}]*${close})`))
    .filter(Boolean)
    .map((part): Segment => (part.startsWith(open) ? { strong: part.slice(1, -1) } : part))
}

// Names who sends the email and where, from OPERATOR_NAME and OPERATOR_ADDRESS, so every email
// identifies its sender with a postal address next to the unsubscribe link.
export function senderLine(operator: Operator | undefined, locale: Locale = defaultLocale) {
  if (!operator) return undefined
  const t = translator(locale)
  const address = operator.address
    ?.split(/\s*\n\s*/)
    .filter(Boolean)
    .join(", ")
  return address
    ? t("sentByAddress", { name: operator.name, address })
    : t("sentBy", { name: operator.name })
}

function shared(t: Translator, { appUrl, locale }: Common & { locale: Locale }) {
  return {
    locale,
    logo: appUrl
      ? {
          light: new URL("/email/sniptide-logo.png", appUrl).href,
          dark: new URL("/email/sniptide-logo-dark.png", appUrl).href,
          alt: t("logoAlt"),
        }
      : undefined,
    fontsUrl: appUrl ? new URL("/email/fonts/", appUrl).href : undefined,
    buttonFallback: t("buttonFallback"),
  }
}

function accountFooter(t: Translator, { to, operator, locale }: Common & { locale: Locale }) {
  return { reason: t("accountReason", { email: to }), sender: senderLine(operator, locale) }
}

export function verifyEmail(input: Common & { url: string }): EmailContent {
  const locale = input.locale ?? defaultLocale
  const t = translator(locale)
  const common = { ...input, locale }
  return {
    ...shared(t, common),
    subject: t("verify.subject"),
    preview: t("verify.preview"),
    heading: t("verify.heading"),
    body: [paragraph(t, "verify.body", { email: input.to }), [t("verify.next")]],
    action: { label: t("verify.action"), href: input.url },
    note: t("verify.note"),
    footer: accountFooter(t, common),
  }
}

export function approveEmailChange(
  input: Common & { newEmail: string; url: string },
): EmailContent {
  const locale = input.locale ?? defaultLocale
  const t = translator(locale)
  const common = { ...input, locale }
  return {
    ...shared(t, common),
    subject: t("change.subject"),
    preview: t("change.preview", { newEmail: input.newEmail }),
    heading: t("change.heading"),
    body: [paragraph(t, "change.body", { email: input.to, newEmail: input.newEmail })],
    action: { label: t("change.action"), href: input.url },
    after: [[t("change.after")]],
    note: t("change.note"),
    footer: accountFooter(t, common),
  }
}

export function resetPassword(input: Common & { url: string }): EmailContent {
  const locale = input.locale ?? defaultLocale
  const t = translator(locale)
  const common = { ...input, locale }
  return {
    ...shared(t, common),
    subject: t("reset.subject"),
    preview: t("reset.preview"),
    heading: t("reset.heading"),
    body: [[t("reset.body")]],
    action: { label: t("reset.action"), href: input.url },
    after: [[t("reset.after")]],
    note: t("reset.note"),
    footer: accountFooter(t, common),
  }
}

// Notification emails carry no paste title, slug, content or person, so a forwarded or leaked
// email reveals nothing about the paste. The reader signs in to see the details.
export function notificationEmail(
  input: Common & {
    kind: NotificationKind
    sharedBurn?: boolean
    url: string
    settingsUrl: string
    unsubscribeUrl: string
  },
): EmailContent {
  const locale = input.locale ?? defaultLocale
  const t = translator(locale)
  const kind = input.sharedBurn ? "sharedBurn" : input.kind
  const subject = t(`notification.${kind}.subject`)
  return {
    ...shared(t, { ...input, locale }),
    subject,
    preview: t(`notification.${kind}.preview`),
    heading: subject,
    body: [[t(`notification.${kind}.body`)], [t("notification.privacy")]],
    action: { label: t(`notification.${kind}.action`), href: input.url },
    footer: {
      reason: t("notification.reason", {
        email: input.to,
        event: t(`notification.${kind}.event`),
      }),
      links: [
        { label: t("notification.settings"), href: input.settingsUrl },
        { label: t("notification.unsubscribe"), href: input.unsubscribeUrl },
      ],
      sender: senderLine(input.operator, locale),
    },
  }
}

// Sent once, when a new account starts its first session. It points to the app's editor and to the
// MCP and CLI pages of the documentation, which is where most people go next.
export function welcomeEmail(input: Common & { appUrl: string; docsUrl: string }): EmailContent {
  const locale = input.locale ?? defaultLocale
  const t = translator(locale)
  const common = { ...input, locale }
  const app = (path: string) => new URL(path, input.appUrl).href
  const docs = (path: string) => new URL(path, input.docsUrl.replace(/\/?$/, "/")).href
  return {
    ...shared(t, common),
    buttonFallback: undefined,
    subject: t("welcome.subject"),
    preview: t("welcome.preview"),
    heading: t("welcome.heading"),
    body: [paragraph(t, "welcome.body", { email: input.to }), [t("welcome.next")]],
    action: { label: t("welcome.action"), href: app("/new") },
    steps: [
      { label: t("welcome.agent.label"), body: t("welcome.agent.body"), href: docs("mcp") },
      { label: t("welcome.cli.label"), body: t("welcome.cli.body"), href: docs("cli") },
      {
        label: t("welcome.settings.label"),
        body: t("welcome.settings.body"),
        href: app("/settings"),
      },
    ],
    footer: {
      reason: t("welcome.reason", { email: input.to }),
      sender: senderLine(input.operator, locale),
    },
  }
}
