"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { PasteGate } from "./paste-gate"

type UnlockError =
  | "couldnTReachTheServerTry"
  | "unlockRateLimit"
  | "unlockRequestSize"
  | "unlockPasswordLength"
  | "thatPasswordIsnTRight"

// The password prompt on a protected paste's share page. Everyone who opens the link sees it, its
// owner included, so the owner gets a line that says so and a way into their own copy.
export function UnlockForm({ slug, ownerHref }: { slug: string; ownerHref?: string }) {
  const t = useTranslations("Paste")
  const router = useRouter()
  const inputId = React.useId()
  const errorId = React.useId()
  const [error, setError] = React.useState<UnlockError | null>(null)
  const [visible, setVisible] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  return (
    <PasteGate
      slug={slug}
      icon={<LockIcon />}
      title={t("passwordNeeded")}
      description={
        <>
          <p>{t("whoeverSharedThisPasteProtectedIt")}</p>
          {ownerHref ? <OwnerNote message={t("ownerLockGate")} href={ownerHref} /> : null}
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
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
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-medium">
            {t("password")}
          </label>
          <div className="relative">
            <Input
              id={inputId}
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="off"
              autoFocus
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              onChange={() => setError(null)}
              className="pr-10 text-base lg:text-sm"
            />
            <button
              type="button"
              aria-label={visible ? t("hidePassword") : t("showPassword")}
              aria-pressed={visible}
              onClick={() => setVisible((current) => !current)}
              className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          <FormError id={errorId} variant="inline" message={error ? t(error) : null} />
        </div>
        <Button type="submit" size="lg" loading={pending} className="w-full">
          {pending ? t("checking") : t("unlock")}
        </Button>
      </form>
    </PasteGate>
  )
}

// For the owner on their own gate: why they see it, and a link to their copy in the app.
export function OwnerNote({ message, href }: { message: string; href: string }) {
  const t = useTranslations("Paste")
  return (
    <p>
      {message}{" "}
      <a href={href} className="font-medium text-link hover:underline">
        {t("openInYourPastes")}
      </a>
    </p>
  )
}
