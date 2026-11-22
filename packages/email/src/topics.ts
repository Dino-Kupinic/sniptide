// The kinds of email a subscriber can choose between. Each is a Resend topic: the app records
// which ones an account turned on, and the admin app sends each kind to its topic, so a broadcast
// reaches only the people who want that kind. Resend's unsubscribe page lists the same topics.
export const EMAIL_TOPICS = ["update", "survey", "guide"] as const

export type EmailTopic = (typeof EMAIL_TOPICS)[number]

export function isEmailTopic(value: unknown): value is EmailTopic {
  return typeof value === "string" && (EMAIL_TOPICS as readonly string[]).includes(value)
}

// The Resend topic id of each kind, from RESEND_TOPIC_UPDATES, RESEND_TOPIC_SURVEYS and
// RESEND_TOPIC_GUIDES.
export type TopicIds = Record<EmailTopic, string>
