"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@sniptide/ui/components/dialog"
import { Input } from "@sniptide/ui/components/input"
import * as React from "react"
import type { CollectionActionResult } from "@/lib/collections/actions"
import { MAX_NAME_LENGTH } from "@/lib/collections/types"

// Asks for a collection's name, for both creating one and renaming one. `onSubmit` returns the
// action's result; the dialog closes on success and shows the error otherwise.
export function CollectionNameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pendingLabel,
  initialName = "",
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
  // Shown before the name field, like New collection's icon button.
  leading?: React.ReactNode
  onSubmit: (name: string) => Promise<CollectionActionResult>
}) {
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
              const result = await onSubmit(name)
              if (!result.ok) return setError(result.error)
              onOpenChange(false)
            })
          }}
        >
          <div className="flex gap-2">
            {leading}
            <Input
              key={initialName}
              name="name"
              aria-label="Collection name"
              placeholder="api-snippets"
              defaultValue={initialName}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              required
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              aria-invalid={Boolean(error)}
              className="h-10 min-w-0 flex-1 font-mono text-base lg:text-[13px]"
            />
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
              Cancel
            </DialogClose>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
