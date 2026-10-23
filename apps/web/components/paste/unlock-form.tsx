"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { LockIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"

type UnlockError =
  | "couldnTReachTheServerTry"
  | "unlockRateLimit"
  | "unlockRequestSize"
  | "unlockPasswordLength"
  | "thatPasswordIsnTRight"

export function UnlockForm({ slug }: { slug: string }) {
  const t = useTranslations("Paste")
  const router = useRouter()
  const [error, setError] = React.useState<UnlockError | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <form
      className="rounded-lg flex w-full max-w-sm flex-col gap-4 border border-border bg-background p-6 shadow-(--dialog-shadow)"
      onSubmit={(event) => {
        event.preventDefault()
        const password = String(new FormData(event.currentTarget).get("password"))
        startTransition(async () => {
          const response = await fetch(`/${encodeURIComponent(slug)}/unlock`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password }),
          }).catch(() => null)
          if (!response) return setError("couldnTReachTheServerTry")
          if (!response.ok) {
            return setError(
              response.status === 429
                ? "unlockRateLimit"
                : response.status === 413
                  ? "unlockRequestSize"
                  : response.status === 400
                    ? "unlockPasswordLength"
                    : "thatPasswordIsnTRight",
            )
          }
          router.refresh()
        })
      }}
    >
      <LockIcon className="size-5" />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-[-0.02em]">
          {t("passwordNeeded")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("whoeverSharedThisPasteProtectedIt")}</p>
      </div>
      <Input
        name="password"
        type="password"
        aria-label={t("password")}
        autoComplete="off"
        required
        aria-invalid={Boolean(error)}
        className="h-10 text-base lg:text-sm"
      />
      <FormError variant="inline" message={error ? t(error) : null} />
      <Button type="submit" loading={pending} className="h-[38px]">
        {pending ? t("checking") : t("unlock")}
      </Button>
    </form>
  )
}
