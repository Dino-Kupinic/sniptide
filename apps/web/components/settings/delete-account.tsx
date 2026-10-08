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
import { Input } from "@sniptide/ui/components/input"
import { useRouter } from "next/navigation"
import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { SettingsSection } from "./section"

export function DeleteAccountSection({ pasteCount }: { pasteCount: number }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <SettingsSection
      title="Delete account"
      description={`Removes your account and signs you out everywhere. Your ${pasteCount} pastes and their share links go with it. This can't be undone.`}
    >
      <div className="flex flex-col gap-3 border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-foreground/80">
          Copy anything you want to keep before you go.
        </p>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            setError(null)
          }}
        >
          <AlertDialogTrigger
            render={
              <Button size="lg" className="bg-destructive text-white hover:bg-destructive/85" />
            }
          >
            Delete account
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your password to confirm. Your account, sessions and pastes are deleted for
              good.
            </AlertDialogDescription>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                const password = String(new FormData(event.currentTarget).get("password") ?? "")
                startTransition(async () => {
                  const { error } = await authClient.deleteUser({ password: password || undefined })
                  if (error) return setError(error.message ?? "Couldn't delete your account.")
                  router.replace("/sign-up")
                  router.refresh()
                })
              }}
            >
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                aria-label="Password"
                placeholder="Password"
                aria-invalid={Boolean(error)}
                className="h-10 text-base lg:text-sm"
              />
              {error ? (
                <p role="alert" className="text-[13px] text-destructive">
                  {error}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogClose render={<Button type="button" variant="outline" size="lg" />}>
                  Cancel
                </AlertDialogClose>
                <Button
                  type="submit"
                  size="lg"
                  disabled={pending}
                  className="bg-destructive text-white hover:bg-destructive/85"
                >
                  {pending ? "Deleting…" : "Delete account"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingsSection>
  )
}
