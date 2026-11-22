// The kinds of email the admin app sends to subscribers. Each kind has its own template and its
// own fields in the composer, and all of them go to the same product updates segment.
export const EMAIL_KINDS = ["update", "survey", "guide"] as const

export type EmailKind = (typeof EMAIL_KINDS)[number]

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && (EMAIL_KINDS as readonly string[]).includes(value)
}

// Names and descriptions for the type picker and the email list.
export const KINDS: Record<EmailKind, { name: string; description: string; untitled: string }> = {
  update: {
    name: "Product update",
    description: "Release notes and announcements under a blue cover with an optional screenshot.",
    untitled: "Untitled update",
  },
  survey: {
    name: "Survey or feedback request",
    description: "A short ask with a link to your survey and an optional one-click rating.",
    untitled: "Untitled survey",
  },
  guide: {
    name: "Educational content",
    description: "A guide or tutorial with a topic, a reading time and a link to read more.",
    untitled: "Untitled guide",
  },
}
