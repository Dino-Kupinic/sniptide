"use client"

import { Button } from "@sniptide/ui/components/button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { authInputClass, authSubmitClass, FormError } from "./fields"
import { BackToSignIn } from "./forgot-password-form"
import { NewPasswordField } from "./password-field"

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Auth")
  const router = useRouter()
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [expired, setExpired] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const { error } = await authClient
      .resetPassword({ newPassword: password, token })
      .catch(() => ({ error: { status: 0, code: undefined } }))
    if (error) {
      setPending(false)
      if (error.code === "INVALID_TOKEN") return setExpired(true)
      setError(
        t(
          error.code === "PASSWORD_TOO_SHORT"
            ? "passwordHint.minimum"
            : error.status === 0
              ? "errors.network"
              : "errors.reset",
        ),
      )
      return
    }
    router.replace("/sign-in?reset=1")
  }

  if (expired) return <ResetLinkExpired />

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 lg:gap-6">
      <NewPasswordField
        id="new-password"
        label={t("newPassword")}
        value={password}
        onChange={setPassword}
        className={authInputClass}
        labelClassName="text-sm lg:text-[13px]"
      />

      <FormError message={error} />

      <Button type="submit" loading={pending} className={authSubmitClass}>
        {t(pending ? "savingPassword" : "setNewPassword")}
      </Button>
    </form>
  )
}

export function ResetLinkExpired() {
  const t = useTranslations("Auth")
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <FormError message={t("resetLinkExpired")} />
      <Button
        className={authSubmitClass}
        render={<Link href="/forgot-password" />}
        nativeButton={false}
      >
        {t("requestNewLink")}
      </Button>
      <BackToSignIn />
    </div>
  )
}
