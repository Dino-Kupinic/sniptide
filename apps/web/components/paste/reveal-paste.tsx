"use client"

import { Button } from "@sniptide/ui/components/button"
import { FlameIcon } from "lucide-react"
import * as React from "react"
import { FileViewer } from "./file-viewer"
import { ShareActions } from "./share-actions"

interface RevealedPaste {
  title: string
  files: { name: string; language: string; content: string }[]
}

// The share page of a burn-after-read paste. Nothing of it is sent until the visitor asks: the
// reveal route then hands it over once and burns it, so a link preview can't use it up first.
export function RevealPaste({ slug }: { slug: string }) {
  const [paste, setPaste] = React.useState<RevealedPaste | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  if (paste) {
    const first = paste.files[0]
    return (
      <div className="flex w-full flex-col gap-4 lg:gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="font-heading text-[32px] leading-10 font-bold tracking-[-0.03em] lg:text-5xl lg:leading-[56px]">
            {paste.title}
          </h1>
          {first ? <ShareActions content={first.content} /> : null}
        </div>
        <p className="border border-primary bg-primary/5 px-3 py-2 text-[13px] text-link">
          This paste was set to burn after reading. It's gone once you leave this page, so copy what
          you need now.
        </p>
        <FileViewer slug={slug} files={paste.files} rawAllowed={false} bodyClassName="bg-sidebar" />
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 self-center border border-foreground bg-background p-6 shadow-[8px_8px_0_0_var(--foreground)]">
      <FlameIcon className="size-5" />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-[-0.02em] uppercase">Read once</h1>
        <p className="text-sm text-muted-foreground">
          This paste burns after reading. Opening it deletes it, so open it when you're ready to
          copy what you need.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={pending}
        className="h-10"
        onClick={() =>
          startTransition(async () => {
            const response = await fetch(`/${encodeURIComponent(slug)}/reveal`, {
              method: "POST",
            }).catch(() => null)
            if (!response) return setError("Couldn't reach the server. Try again.")
            const body = await response.json().catch(() => null)
            if (!response.ok || !body?.ok)
              return setError(body?.error ?? "This paste is gone. Someone already read it.")
            setPaste({ title: body.title, files: body.files })
          })
        }
      >
        {pending ? "Opening…" : "Open and burn"}
      </Button>
    </div>
  )
}
