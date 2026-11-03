import { notificationEmail } from "@/lib/email/content"
import { EmailLayout } from "@/lib/email/layout"

type Props = Omit<Parameters<typeof notificationEmail>[0], "kind">

export default function PasteBurned(props: Props) {
  return <EmailLayout content={notificationEmail({ ...props, kind: "burned" })} />
}

PasteBurned.PreviewProps = {
  to: "dana@example.com",
  // The logo loads from a running app (bun dev).
  appUrl: "http://localhost:3000",
  url: "https://sniptide.com/trash",
  settingsUrl: "https://sniptide.com/settings?tab=notifications",
  unsubscribeUrl: "https://sniptide.com/api/notifications/unsubscribe?token=preview",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies Props
