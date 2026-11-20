import { welcomeEmail } from "@/lib/email/content"
import { EmailLayout } from "@/lib/email/layout"

type Props = Parameters<typeof welcomeEmail>[0]

export default function Welcome(props: Props) {
  return <EmailLayout content={welcomeEmail(props)} />
}

Welcome.PreviewProps = {
  to: "dana@example.com",
  // The logo and fonts load from a running app (bun dev).
  appUrl: "http://localhost:3000",
  docsUrl: "https://docs.sniptide.com",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies Props
