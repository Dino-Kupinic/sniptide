"use client"

import { Input } from "@sniptide/ui/components/input"
import { useTranslations } from "next-intl"
import { CopyButton } from "./copy-button"

// The Share dialog's Embed section: the iframe code for /<slug>/embed, ready to copy. A paste that
// needs a password, burns after reading or is private can't be embedded, and the section says so.
export function EmbedShare({ code }: { code?: string }) {
  const t = useTranslations("Paste")
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-4 lg:px-6">
      <p className="text-sm font-medium">{t("embed")}</p>
      {code ? (
        <>
          <p className="text-xs text-muted-foreground">{t("embedHint")}</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={code}
              aria-label={t("embedCode")}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <CopyButton text={code} variant="outline" size="lg" className="shrink-0" />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("useAPublicOrUnlistedPaste")}</p>
      )}
    </div>
  )
}
