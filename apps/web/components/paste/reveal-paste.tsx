"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { FlameIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { track } from "@/lib/analytics"
import { FileViewer } from "./file-viewer"
import { ShareActions } from "./share-actions"

type RevealError = "couldnTReachTheServerTry" | "unlockFirst" | "thisPasteIsGoneSomeoneAlready"

interface RevealedPaste {
  title: string
  files: { name: string; language: string; content: string }[]
}

// The share page of a burn-after-read paste. Nothing of it is sent until the visitor asks: the
// reveal route then hands it over once and burns it, so a link preview can't use it up first.
export function RevealPaste({ slug }: { slug: string }) {
  const t = useTranslations("Paste")
  const [paste, setPaste] = React.useState<RevealedPaste | null>(null)
  const [error, setError] = React.useState<RevealError | null>(null)
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
        <p className="rounded-lg border border-primary bg-primary/5 px-3 py-2 text-[13px] text-link">
          {t("thisPasteWasSetToBurn")}
        </p>
        <FileViewer slug={slug} files={paste.files} rawAllowed={false} bodyClassName="bg-sidebar" />
      </div>
    )
  }

  return (
    <div className="rounded-lg flex w-full max-w-sm flex-col gap-4 self-center border border-border bg-background p-6 shadow-(--dialog-shadow)">
      <FlameIcon className="size-5" />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-[-0.02em]">{t("readOnce")}</h1>
        <p className="text-sm text-muted-foreground">{t("thisPasteBurnsAfterReadingOpening")}</p>
      </div>
      <FormError variant="inline" message={error ? t(error) : null} />
      <Button
        type="button"
        loading={pending}
        className="h-[38px]"
        onClick={() =>
          startTransition(async () => {
            const response = await fetch(`/${encodeURIComponent(slug)}/reveal`, {
              method: "POST",
            }).catch(() => null)
            if (!response) return setError("couldnTReachTheServerTry")
            const body = await response.json().catch(() => null)
            if (!response.ok || !body?.ok)
              return setError(
                response.status === 401 ? "unlockFirst" : "thisPasteIsGoneSomeoneAlready",
              )
            track("burn_after_read_opened")
            setPaste({ title: body.title, files: body.files })
          })
        }
      >
        {pending ? t("opening") : t("openAndBurn")}
      </Button>
    </div>
  )
}
