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
import * as React from "react"
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
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="-my-0.5 shrink-0 text-muted-foreground"
        aria-label={`Restore revision ${number}`}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <RotateCcwIcon />
        Restore
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Restore revision {number}?</AlertDialogTitle>
          <AlertDialogDescription>
            The title, description and files go back to how they were then. The link, visibility and
            other settings stay as they are. What's there now stays in the history, so you can
            restore it again.
          </AlertDialogDescription>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="lg" />}>
              Cancel
            </AlertDialogClose>
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await restoreRevision(slug, revisionId)
                  if (!result.ok) return setError(result.error)
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              {pending ? "Restoring…" : "Restore"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
