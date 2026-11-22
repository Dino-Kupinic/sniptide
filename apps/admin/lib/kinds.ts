import { EMAIL_TOPICS, type EmailTopic, isEmailTopic } from "@workspace/email/topics"

// The kinds of email the admin app sends to subscribers. Each kind has its own template and its
// own fields in the composer, and goes to the subscribers who turned that kind on in Settings.
export const EMAIL_KINDS = EMAIL_TOPICS

export type EmailKind = EmailTopic

export const isEmailKind = isEmailTopic

// Names and descriptions for the type picker and the email list.
export const KINDS: Record<
  EmailKind,
  { name: string; description: string; untitled: string; audience: string }
> = {
  update: {
    audience: "product updates",
    name: "Product update",
    description: "Release notes and announcements under a blue cover with an optional screenshot.",
    untitled: "Untitled update",
  },
  survey: {
    audience: "surveys and feedback",
    name: "Survey or feedback request",
    description: "A short ask with a link to your survey and an optional one-click rating.",
    untitled: "Untitled survey",
  },
  guide: {
    audience: "guides and tips",
    name: "Educational content",
    description: "A guide or tutorial with a topic, a reading time and a link to read more.",
    untitled: "Untitled guide",
  },
}
