import { Button } from "@sniptide/ui/components/button"
import Link from "next/link"
import { authSubmitClass, inlineLinkClass, SwitchPrompt } from "./fields"

// The sign-up page while sign-up is invite-only: one call to apply, and the account form for
// people who already have an invite.
export function RequestAccess({ applyUrl }: { applyUrl?: string }) {
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      {applyUrl ? (
        <Button
          className={authSubmitClass}
          render={<a href={applyUrl} target="_blank" rel="noreferrer" />}
          nativeButton={false}
        >
          Apply for access
        </Button>
      ) : null}
      <div className="flex flex-col gap-2">
        <SwitchPrompt>
          Got an invite?{" "}
          <Link href="/sign-up?invite" className={inlineLinkClass}>
            Create your account
          </Link>
        </SwitchPrompt>
        <SwitchPrompt>
          Already have an account?{" "}
          <Link href="/sign-in" className={inlineLinkClass}>
            Sign in
          </Link>
        </SwitchPrompt>
      </div>
    </div>
  )
}
