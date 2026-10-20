"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@sniptide/ui/components/dialog"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { useTranslations } from "next-intl"
import * as React from "react"
import { MAX_NAME_LENGTH } from "@/lib/collections/types"

// Asks for a name, for both creating and renaming a collection (and a folder, with its own limits
// and field label). `onSubmit` returns the action's result; the dialog closes on success and shows
// the error otherwise.
export function CollectionNameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pendingLabel,
  initialName = "",
  label,
  fieldLabel,
  maxLength = MAX_NAME_LENGTH,
  placeholder = "api-snippets",
  leading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  submitLabel: string
  pendingLabel: string
  initialName?: string
  // A visible label above the name field; without one the field is labelled for screen readers.
  label?: string
  // What a screen reader calls the field when there's no visible label.
  fieldLabel?: string
  maxLength?: number
  placeholder?: string
  // Shown before the name field, like New collection's icon button.
  leading?: React.ReactNode
  onSubmit: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const t = useTranslations("Workspace")
  const nameId = React.useId()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        setError(null)
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const name = String(new FormData(event.currentTarget).get("name") ?? "")
            startTransition(async () => {
              try {
                const result = await onSubmit(name)
                if (!result.ok) return setError(result.error)
              } catch {
                return setError(t("something_went_wrong_try_again"))
              }
              onOpenChange(false)
            })
          }}
        >
          {label ? (
            <label htmlFor={nameId} className="-mb-1 text-sm font-medium">
              {label}
            </label>
          ) : null}
          <div className="flex gap-2">
            {leading}
            <Input
              key={initialName}
              id={nameId}
              name="name"
              aria-label={label ? undefined : (fieldLabel ?? t("collection_name"))}
              placeholder={placeholder}
              defaultValue={initialName}
              maxLength={maxLength}
              autoComplete="off"
              required
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              aria-invalid={Boolean(error)}
              className="h-10 min-w-0 flex-1 font-mono text-base lg:text-[13px]"
            />
          </div>
          <FormError variant="inline" message={error} />
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit" size="lg" loading={pending}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
