import { Button } from "@sniptide/ui/components/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { authSubmitClass, inlineLinkClass, SwitchPrompt } from "./fields"

// The sign-up page while sign-up is invite-only: one call to apply, and the account form for
// people who already have an invite.
export function RequestAccess({ applyUrl }: { applyUrl?: string }) {
  const t = useTranslations("Auth")
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      {applyUrl ? (
        <Button
          className={authSubmitClass}
          render={<a href={applyUrl} target="_blank" rel="noreferrer" />}
          nativeButton={false}
        >
          {t("applyAccess")}
        </Button>
      ) : null}
      <div className="flex flex-col gap-2">
        <SwitchPrompt>
          {t.rich("invitePrompt", {
            link: (children) => (
              <Link href="/sign-up?invite" className={inlineLinkClass}>
                {children}
              </Link>
            ),
          })}
        </SwitchPrompt>
        <SwitchPrompt>
          {t.rich("existingAccountPrompt", {
            link: (children) => (
              <Link href="/sign-in" className={inlineLinkClass}>
                {children}
              </Link>
            ),
          })}
        </SwitchPrompt>
      </div>
    </div>
  )
}
