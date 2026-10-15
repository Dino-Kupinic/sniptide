import Link from "next/link"
import { inlineLinkClass, SwitchPrompt } from "./fields"

// The sign-up page while ALLOW_SIGN_UP=false.
export function SignUpClosed() {
  return (
    <SwitchPrompt>
      Already have an account?{" "}
      <Link href="/sign-in" className={inlineLinkClass}>
        Sign in
      </Link>
    </SwitchPrompt>
  )
}
