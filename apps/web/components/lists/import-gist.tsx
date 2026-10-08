"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@sniptide/ui/components/dialog"
import { Input } from "@sniptide/ui/components/input"
import { DownloadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { importGist } from "@/lib/pastes/actions"

export function ImportGistButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setError(null)
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        <DownloadIcon />
        Import gist
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Import a gist</DialogTitle>
        <DialogDescription>
          Copies a public GitHub gist into a new unlisted paste. Files over GitHub's 1 MB preview
          limit are skipped.
        </DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const url = String(new FormData(event.currentTarget).get("gist"))
            startTransition(async () => {
              const result = await importGist(url)
              if (!result.ok) return setError(result.error)
              setOpen(false)
              router.push(`/pastes/${result.slug}`)
            })
          }}
        >
          <Input
            name="gist"
            aria-label="Gist link"
            placeholder="https://gist.github.com/you/1a2b3c…"
            required
            aria-invalid={Boolean(error)}
            className="h-10 text-base lg:text-sm"
          />
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
              {pending ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
