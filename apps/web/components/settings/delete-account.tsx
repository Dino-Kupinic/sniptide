"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@sniptide/ui/components/alert-dialog"
import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { SettingsSection } from "./section"

export function DeleteAccountSection({ pasteCount }: { pasteCount: number }) {
  const t = useTranslations("Settings")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title={t("deleteAccount")}
      description={t("deleteAccountDescription", { count: pasteCount })}
    >
      <div className="rounded-lg flex flex-col gap-3 border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-foreground/80">{t("copyAnythingYouWantToKeep")}</p>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            setError(null)
          }}
        >
          <AlertDialogTrigger render={<Button variant="destructive" size="lg" />}>
            {t("deleteAccount")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t("deleteYourAccount")}</AlertDialogTitle>
            <AlertDialogDescription>{t("enterYourPasswordToConfirmYour")}</AlertDialogDescription>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                const password = String(new FormData(event.currentTarget).get("password") ?? "")
                startTransition(async () => {
                  const { error } = await authClient
                    .deleteUser({ password: password || undefined })
                    .catch(() => ({ error: { message: undefined } }))
                  if (error) return setError(error.message ?? t("couldnTDeleteYourAccount"))
                  router.replace("/sign-up")
                  router.refresh()
                })
              }}
            >
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                aria-label={t("password")}
                placeholder={t("password")}
                aria-invalid={Boolean(error)}
                className="h-10 text-base lg:text-sm"
              />
              <FormError variant="inline" message={error} />
              <AlertDialogFooter>
                <AlertDialogClose render={<Button type="button" variant="outline" size="lg" />}>
                  {t("cancel")}
                </AlertDialogClose>
                <Button type="submit" variant="destructive" size="lg" loading={pending}>
                  {pending ? t("deleting") : t("deleteAccount")}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingsSection>
  )
}
