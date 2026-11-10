"use client"

import { Badge } from "@sniptide/ui/components/badge"
import { ClockIcon } from "lucide-react"
import { useNow, useTranslations } from "next-intl"
import * as React from "react"

const ExpiryNow = React.createContext<number | null>(null)

export function PasteExpiryClock({ children }: { children: React.ReactNode }) {
  const now = useNow({ updateInterval: 1_000 })
  return <ExpiryNow value={now.getTime()}>{children}</ExpiryNow>
}

export function usePasteExpired(expiresAt: number | null) {
  const now = React.useContext(ExpiryNow)
  return expiresAt !== null && expiresAt <= (now ?? Date.now())
}

export function ExpiredBadge({ expiresAt }: { expiresAt: number | null }) {
  const expired = usePasteExpired(expiresAt)
  const t = useTranslations("Core")
  if (!expired) return null
  return (
    <Badge variant="muted" className="gap-1.5 text-muted-foreground">
      <ClockIcon aria-hidden="true" className="size-3" />
      {t("expired")}
    </Badge>
  )
}

export function ExpiredNotice({ expiresAt }: { expiresAt: number | null }) {
  const expired = usePasteExpired(expiresAt)
  const t = useTranslations("Paste")
  if (!expired) return null
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {t("expiredSharingHelp")}
    </p>
  )
}
