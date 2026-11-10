import { approveEmailChange } from "@/lib/email/content"
import { EmailLayout } from "@/lib/email/layout"

type Props = Parameters<typeof approveEmailChange>[0]

export default function ApproveEmailChange(props: Props) {
  return <EmailLayout content={approveEmailChange(props)} />
}

ApproveEmailChange.PreviewProps = {
  to: "dana@example.com",
  // The logo loads from a running app (bun dev).
  appUrl: "http://localhost:3000",
  newEmail: "dana@work.example.com",
  url: "https://sniptide.com/api/auth/verify-email?token=preview&callbackURL=%2Fsettings",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies Props
