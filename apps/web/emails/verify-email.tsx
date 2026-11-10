import { verifyEmail } from "@/lib/email/content"
import { EmailLayout } from "@/lib/email/layout"

type Props = Parameters<typeof verifyEmail>[0]

export default function VerifyEmail(props: Props) {
  return <EmailLayout content={verifyEmail(props)} />
}

VerifyEmail.PreviewProps = {
  to: "dana@example.com",
  // The logo loads from a running app (bun dev).
  appUrl: "http://localhost:3000",
  url: "https://sniptide.com/api/auth/verify-email?token=preview&callbackURL=%2Fsettings",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies Props
