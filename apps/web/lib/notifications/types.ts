export const NOTIFICATION_KINDS = ["shared", "burned", "expiring", "views"] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

// A notification as the bell lists it: the text is already written and the link already built.
export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  href: string
  createdAt: number
  read: boolean
}

// What /api/notifications returns. `unread` counts every unread notification, not only those in
// `items`, so the badge stays right when more than a page of them piled up.
export interface NotificationFeed {
  items: NotificationItem[]
  unread: number
}

// How often the bell asks for new ones while the page is open and in view.
export const NOTIFICATION_POLL_MS = 30_000
