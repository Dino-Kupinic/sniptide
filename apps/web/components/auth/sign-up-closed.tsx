import Link from "next/link"
import { useTranslations } from "next-intl"
import { inlineLinkClass, SwitchPrompt } from "./fields"

// The sign-up page while ALLOW_SIGN_UP=false.
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
