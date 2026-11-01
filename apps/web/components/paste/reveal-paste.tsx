"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { FlameIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { track } from "@/lib/analytics"
import { PasteGate } from "./paste-gate"
import { BurnNotice, SharedPasteView, type SharedPasteViewData } from "./shared-paste-view"
import { OwnerNote } from "./unlock-form"

type RevealError = "couldnTReachTheServerTry" | "unlockFirst" | "thisPasteIsGoneSomeoneAlready"

interface Revealed {
  paste: SharedPasteViewData
  burned: boolean
}

// The share page of a burn-after-read paste. Nothing of it is sent until the visitor asks: the
// reveal route then hands it over once and burns it, so a link preview can't use it up first.
// Everyone sees this step and every reveal burns, the owner's included; the owner also gets a link
// to read it in the app without burning it. Once revealed, the paste renders through the same view
// and highlighting as any other share page.
export function RevealPaste({
  slug,
  ownerHref,
  after,
}: {
  slug: string
  // Set when the visitor owns the paste: links to their copy in the app.
  ownerHref?: string
  // Below the gate and the revealed paste, such as the sign-up prompt.
  after?: React.ReactNode
}) {
  const t = useTranslations("Paste")
  const [revealed, setRevealed] = React.useState<Revealed | null>(null)
  const [error, setError] = React.useState<RevealError | null>(null)
  const [pending, startTransition] = React.useTransition()

  if (revealed) {
    return (
      <SharedPasteView
        slug={slug}
        gone={revealed.burned}
        paste={revealed.paste}
        notice={revealed.burned ? <BurnNotice /> : null}
        after={after}
      />
    )
  }

  const gone = error === "thisPasteIsGoneSomeoneAlready"
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <PasteGate
        slug={slug}
        icon={<FlameIcon />}
        title={t("readOnce")}
        description={
          <>
            <p>{t("thisPasteBurnsAfterReadingOpening")}</p>
            {ownerHref ? <OwnerNote message={t("ownerBurnGate")} href={ownerHref} /> : null}
          </>
        }
      >
        <FormError message={error ? t(error) : null} />
        {gone ? null : (
          <Button
            type="button"
            size="lg"
            loading={pending}
            className="w-full"
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
                if (body.burned) track("burn_after_read_opened")
                setRevealed({
                  burned: Boolean(body.burned),
                  paste: {
                    title: body.title,
                    author: body.author,
                    files: body.files,
                    updatedAt: body.updatedAt,
                    expiresAt: body.expiresAt,
                    views: body.views,
                    burnAfterRead: true,
                    allowRaw: !body.burned,
                  },
                })
              })
            }
          >
            {pending ? t("opening") : t("openAndBurn")}
          </Button>
        )}
      </PasteGate>
      {after}
    </div>
  )
}
