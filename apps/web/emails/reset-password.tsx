import { resetPassword } from "@/lib/email/content"
import { EmailLayout } from "@/lib/email/layout"

type Props = Parameters<typeof resetPassword>[0]

export default function ResetPassword(props: Props) {
  return <EmailLayout content={resetPassword(props)} />
}

ResetPassword.PreviewProps = {
  to: "dana@example.com",
  url: "https://sniptide.com/api/auth/reset-password/preview?callbackURL=%2Freset-password",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies Props
