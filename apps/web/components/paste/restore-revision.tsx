"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@sniptide/ui/components/alert-dialog"
import { Button } from "@sniptide/ui/components/button"
import { RotateCcwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { runAction } from "@/lib/feedback"
import { restoreRevision } from "@/lib/pastes/actions"

// "Restore" on one entry of the history. It asks first, since it replaces what's on the page now,
// and says the current version stays in the history to come back to.
export function RestoreRevision({
  slug,
  revisionId,
  number,
}: {
  slug: string
  revisionId: number
  number: number
}) {
  const t = useTranslations("Paste")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="-my-0.5 shrink-0 text-muted-foreground max-lg:-my-2 max-lg:h-10 max-lg:px-3 max-lg:text-sm"
        aria-label={t("restoreRevision", { number })}
        onClick={() => setOpen(true)}
      >
        <RotateCcwIcon />
        {t("restore")}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{t("restoreRevisionQuestion", { number })}</AlertDialogTitle>
          <AlertDialogDescription>{t("theTitleDescriptionAndFilesGo")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="lg" />}>
              {t("cancel")}
            </AlertDialogClose>
            <Button
              size="lg"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await runAction(() => restoreRevision(slug, revisionId), {
                    success: t("restoredRevision", { number }),
                    error: t("couldnTRestoreThatVersionTry"),
                  })
                  if (!result.ok) return
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              {pending ? t("restoring") : t("restore")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
