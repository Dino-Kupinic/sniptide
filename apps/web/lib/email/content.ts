import type { NotificationKind } from "@/lib/notifications/types"

// One run of text in a paragraph. `strong` sets an address or name the reader should check apart
// from the sentence around it.
export type Segment = string | { strong: string }
export type Paragraph = Segment[]

export interface EmailLink {
  label: string
  href: string
}

// Everything one email says, written once. The HTML layout and the plain-text version both render
// from it, so the two always carry the same sentences, links and footer.
export interface EmailContent {
  subject: string
  // The preheader: the line inbox lists show after the subject. It adds context and never repeats
  // the subject.
  preview: string
  heading: string
  body: Paragraph[]
  action: EmailLink
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

// Names who sends the email and where, from OPERATOR_NAME and OPERATOR_ADDRESS, so every email
// identifies its sender with a postal address next to the unsubscribe link.
export function senderLine(operator: Operator | undefined) {
  if (!operator) return undefined
  const address = operator.address
    ?.split(/\s*\n\s*/)
    .filter(Boolean)
    .join(", ")
  return `Sent by ${operator.name}${address ? `, ${address}` : ""}.`
}

function accountFooter(to: string, operator: Operator | undefined) {
  return {
    reason: `We sent this email to ${to} because of a request on your Sniptide account.`,
    sender: senderLine(operator),
  }
}

export function verifyEmail({
  to,
  url,
  operator,
}: {
  to: string
  url: string
  operator?: Operator
}): EmailContent {
  return {
    subject: "Verify your Sniptide email",
    preview: "Confirm this address to turn on email notifications. The link works for one hour.",
    heading: "Verify your email",
    body: [
      ["Confirm that ", { strong: to }, " belongs to your Sniptide account."],
      ["Once it's verified, you can choose which events also reach you by email in Settings."],
    ],
    action: { label: "Verify email", href: url },
    note: "If you didn't ask for this email, you can ignore it. The link expires in one hour.",
    footer: accountFooter(to, operator),
  }
}

export function approveEmailChange({
  to,
  newEmail,
  url,
  operator,
}: {
  to: string
  newEmail: string
  url: string
  operator?: Operator
}): EmailContent {
  return {
    subject: "Approve your Sniptide email change",
    preview: `After you approve, we send a verification link to ${newEmail}.`,
    heading: "Approve your email change",
    body: [
      [
        "Someone asked to change the email of your Sniptide account from ",
        { strong: to },
        " to ",
        { strong: newEmail },
        ".",
      ],
    ],
    action: { label: "Approve email change", href: url },
    after: [
      [
        "After you approve, we send a verification link to the new address. The change is complete once that link is opened.",
      ],
    ],
    note: "If you didn't ask for this, ignore this email and change your password. The link expires in one hour.",
    footer: accountFooter(to, operator),
  }
}

export function resetPassword({
  to,
  url,
  operator,
}: {
  to: string
  url: string
  operator?: Operator
}): EmailContent {
  return {
    subject: "Reset your Sniptide password",
    preview: "The link works once, for one hour.",
    heading: "Reset your password",
    body: [["Use this link to choose a new password for your Sniptide account."]],
    action: { label: "Choose a new password", href: url },
    after: [
      ["The link works once, for one hour. Changing your password signs you out on every device."],
    ],
    note: "If you didn't ask for this, you can ignore this email. Your password stays the same.",
    footer: accountFooter(to, operator),
  }
}

// Notification emails carry no paste title, slug, content or person, so a forwarded or leaked
// email reveals nothing about the paste. The reader signs in to see the details.
const notifications = {
  shared: {
    subject: "A paste was shared with you",
    preview: "Sign in to see who shared it and open it.",
    body: "Someone shared a paste with your Sniptide account. Shared with me lists it with the person who shared it.",
    action: "Open Shared with me",
    event: "shared pastes",
  },
  burned: {
    subject: "Your burn after read paste was read",
    preview: "It moved to your trash, where you can restore it for 30 days.",
    body: "One of your burn after read pastes was opened, so its link stopped working. The paste is in your trash, and you can restore it from there for 30 days.",
    action: "Open Trash",
    event: "burn after read pastes",
  },
  expiring: {
    subject: "Your paste expires soon",
    preview: "Change its expiry before then to keep the link working.",
    body: "One of your pastes expires within 24 hours. To keep its link working, open it and change when it expires.",
    action: "Review your pastes",
    event: "expiring pastes",
  },
  views: {
    subject: "Your paste reached a view milestone",
    preview: "Analytics shows which paste it was and where its views came from.",
    body: "One of your pastes reached a new view milestone. Analytics shows which paste it was, its views over time and where they came from.",
    action: "Open Analytics",
    event: "view milestones",
  },
} satisfies Record<
  NotificationKind,
  { subject: string; preview: string; body: string; action: string; event: string }
>

export function notificationEmail({
  kind,
  to,
  url,
  settingsUrl,
  unsubscribeUrl,
  operator,
}: {
  kind: NotificationKind
  to: string
  url: string
  settingsUrl: string
  unsubscribeUrl: string
  operator?: Operator
}): EmailContent {
  const copy = notifications[kind]
  return {
    subject: copy.subject,
    preview: copy.preview,
    heading: copy.subject,
    body: [
      [copy.body],
      ["To keep your pastes private, this email leaves out their titles, links and contents."],
    ],
    action: { label: copy.action, href: url },
    footer: {
      reason: `You get this email at ${to} because you turned on email for ${copy.event} in your notification settings.`,
      links: [
        { label: "Notification settings", href: settingsUrl },
        { label: "Stop these emails", href: unsubscribeUrl },
      ],
      sender: senderLine(operator),
    },
  }
}
