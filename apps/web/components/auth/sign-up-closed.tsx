import Link from "next/link"
import { useTranslations } from "next-intl"
import { inlineLinkClass, SwitchPrompt } from "./fields"

// The sign-up page while sign-up is closed (ALLOW_SIGN_UP=false, or "first" once an account exists).
export function SignUpClosed() {
  const t = useTranslations("Auth")
  return (
    <SwitchPrompt>
      {t.rich("existingAccountPrompt", {
        link: (children) => (
          <Link href="/sign-in" className={inlineLinkClass}>
            {children}
          </Link>
        ),
      })}
    </SwitchPrompt>
  )
}
