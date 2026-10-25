"use client"

import { Button } from "@sniptide/ui/components/button"
import { useTranslations } from "next-intl"
import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { FormError } from "./fields"

export function VerificationNotice({ email }: { email: string }) {
  const t = useTranslations("Auth")
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle")

  async function resend() {
    setStatus("sending")
    const { error } = await authClient
      .sendVerificationEmail({ email, callbackURL: "/dashboard" })
      .catch(() => ({ error: true }))
    setStatus(error ? "error" : "sent")
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm text-muted-foreground">
        {t(status === "sent" ? "verificationResent" : "verificationRequired", { email })}
      </p>
      <FormError message={status === "error" ? t("errors.verification") : null} />
      <Button type="button" variant="outline" loading={status === "sending"} onClick={resend}>
        {t("resendVerification")}
      </Button>
    </div>
  )
}
