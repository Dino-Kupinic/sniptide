"use client"

import { Button } from "@sniptide/ui/components/button"
import { Dialog, DialogContent, DialogTitle } from "@sniptide/ui/components/dialog"
import { FormError } from "@sniptide/ui/components/form-error"
import { Sheet, SheetBody, SheetContent, SheetHeader } from "@sniptide/ui/components/sheet"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { SocialButtons } from "@/components/auth/social-buttons"
import { LanguageIcon } from "@/components/paste/language-icon"
import { useIsDesktop } from "@/components/shell/use-media-query"
import type { SocialProvider } from "@/lib/auth"
import { GUEST_CLAIM_PATH } from "@/lib/auth-redirect"

export interface GuestDraftSummary {
  title: string
  language: string
  detail: string
}

// Sign-in for a guest who pressed "Sign in to share". Every way in returns to GUEST_CLAIM_PATH,
// which creates the paste: GitHub and Google directly, email and new accounts through the sign-in
// and sign-up pages, which carry it as ?next=.
export function GuestSignInDialog({
  open,
  onOpenChange,
  socialProviders,
  signUpClosed,
  summary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  socialProviders: SocialProvider[]
  signUpClosed: boolean
  summary: GuestDraftSummary
}) {
  const t = useTranslations("Paste")
  const desktop = useIsDesktop()

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>{t("signInToShareTitle")}</DialogTitle>
          <GuestSignInOptions
            socialProviders={socialProviders}
            signUpClosed={signUpClosed}
            summary={summary}
          />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader title={t("signInToShare")} closeLabel={t("close")} />
        <SheetBody className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <GuestSignInOptions
            socialProviders={socialProviders}
            signUpClosed={signUpClosed}
            summary={summary}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function GuestSignInOptions({
  socialProviders,
  signUpClosed,
  summary,
}: {
  socialProviders: SocialProvider[]
  signUpClosed: boolean
  summary: GuestDraftSummary
}) {
  const t = useTranslations("Paste")
  const authT = useTranslations("Auth")
  const [error, setError] = React.useState<string | null>(null)
  const next = encodeURIComponent(GUEST_CLAIM_PATH)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
          <LanguageIcon language={summary.language} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{summary.title}</span>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {summary.detail}
          </span>
        </span>
      </div>
      <FormError message={error} />
      <div className="flex flex-col gap-2">
        {socialProviders.length > 0 ? (
          <SocialButtons
            enabled={socialProviders}
            verb="Continue"
            callbackURL={GUEST_CLAIM_PATH}
            onError={setError}
          />
        ) : null}
        <Button
          variant="outline"
          size="xl"
          className="gap-2"
          render={<a href={`/sign-in?next=${next}`} />}
          nativeButton={false}
        >
          <MailIcon />
          {t("continueWithEmail")}
        </Button>
      </div>
      {signUpClosed ? null : (
        <p className="text-center text-[13px] leading-[18px] text-muted-foreground">
          {authT.rich("newAccountPrompt", {
            link: (chunks) => (
              <a
                href={`/sign-up?next=${next}`}
                className="rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      )}
    </div>
  )
}
