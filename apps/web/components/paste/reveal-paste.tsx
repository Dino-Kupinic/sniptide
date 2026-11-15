"use client"

import { keyIdOf, readKey, withKeyFragment } from "@sniptide/contracts/encryption"
import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { FlameIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { track } from "@/lib/analytics"
import { availableKey, EncryptedSharedPaste, KeyForm } from "./encrypted-paste"
import { GateLayout, PasteGate } from "./paste-gate"
import { BurnNotice, SharedPasteView, type SharedPasteViewData } from "./shared-paste-view"
import { OwnerNote } from "./unlock-form"

type RevealError = "couldnTReachTheServerTry" | "unlockFirst" | "thisPasteIsGoneSomeoneAlready"

interface Revealed {
  paste: SharedPasteViewData
  burned: boolean
  // Set for an end-to-end encrypted paste, whose one file is still ciphertext.
  encryptionKeyId: string | null
}

// The share page of a burn-after-read paste. Nothing of it is sent until the visitor asks: the
// reveal route then hands it over once and burns it, so a link preview can't use it up first.
// Everyone sees this step and every reveal burns, the owner's included; the owner also gets a link
// to read it in the app without burning it. Once revealed, the paste renders through the same view
// and highlighting as any other share page.
export function RevealPaste({
  slug,
  ownerHref,
  encryptionKeyId = null,
  after,
}: {
  slug: string
  // Set for an end-to-end encrypted paste. The reader's key is checked against it before the
  // reveal, so a link that lost its key can't spend the only read on text nobody can decrypt.
  encryptionKeyId?: string | null
  // Set when the visitor owns the paste: links to their copy in the app.
  ownerHref?: string
  // Below the gate and the revealed paste, such as the sign-up prompt.
  after?: React.ReactNode
}) {
  const t = useTranslations("Paste")
  const [revealed, setRevealed] = React.useState<Revealed | null>(null)
  const [error, setError] = React.useState<RevealError | null>(null)
  const [pending, startTransition] = React.useTransition()
  // Whether the page holds the key: unknown until the fragment and the key ring are read.
  const [hasKey, setHasKey] = React.useState<boolean | null>(encryptionKeyId ? null : true)
  React.useEffect(() => {
    if (!encryptionKeyId) return
    void availableKey(encryptionKeyId).then((key) => setHasKey(Boolean(key)))
  }, [encryptionKeyId])

  const [sealed] = revealed?.paste.files ?? []
  if (revealed?.encryptionKeyId && sealed) {
    return (
      <EncryptedSharedPaste
        slug={slug}
        gone={revealed.burned}
        paste={revealed.paste}
        envelope={sealed.content}
        keyId={revealed.encryptionKeyId}
        notice={revealed.burned ? <BurnNotice /> : null}
        after={after}
      />
    )
  }
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
    <GateLayout after={after}>
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
        {gone || hasKey === null ? null : !hasKey && encryptionKeyId ? (
          <>
            <p className="text-sm text-muted-foreground">{t("keyNeededBeforeBurn")}</p>
            <KeyForm
              submitLabel={t("checkKey")}
              onKey={async (input) => {
                const key = readKey(input)
                if (!key || (await keyIdOf(key)) !== encryptionKeyId) return false
                // The viewer reads the key from the fragment once the paste is revealed.
                window.history.replaceState(window.history.state, "", withKeyFragment("", key))
                setHasKey(true)
                return true
              }}
            />
          </>
        ) : (
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
                  encryptionKeyId: body.encryptionKeyId ?? null,
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
    </GateLayout>
  )
}
