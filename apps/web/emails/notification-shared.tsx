import { notificationEmail } from "@/lib/email/content"
import { EmailLayout } from "@/lib/email/layout"

type Props = Omit<Parameters<typeof notificationEmail>[0], "kind">

export default function PasteShared(props: Props) {
  return <EmailLayout content={notificationEmail({ ...props, kind: "shared" })} />
}

PasteShared.PreviewProps = {
  to: "dana@example.com",
  url: "https://sniptide.com/shared",
  settingsUrl: "https://sniptide.com/settings?tab=notifications",
  unsubscribeUrl: "https://sniptide.com/api/notifications/unsubscribe?token=preview",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies Props
