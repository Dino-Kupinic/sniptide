import { approveEmailChange } from "@/lib/email/content"
import { EmailLayout } from "@/lib/email/layout"

type Props = Parameters<typeof approveEmailChange>[0]

export default function ApproveEmailChange(props: Props) {
  return <EmailLayout content={approveEmailChange(props)} />
}

ApproveEmailChange.PreviewProps = {
  to: "dana@example.com",
  newEmail: "dana@work.example.com",
  url: "https://sniptide.com/api/auth/verify-email?token=preview&callbackURL=%2Fsettings",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies Props
