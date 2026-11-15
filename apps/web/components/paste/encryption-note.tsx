"use client"

import { LockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { findKey, subscribeKeys } from "@/lib/pastes/keyring"

// Under an encrypted paste's share link: whether the link this browser copies carries the key.
export function EncryptionNote({ keyId }: { keyId: string }) {
  const t = useTranslations("Paste")
  const hasKey = React.useSyncExternalStore(
    subscribeKeys,
    () => findKey(keyId) !== null,
    () => true,
  )
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <LockIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{t(hasKey ? "encryptedLinkHasKey" : "encryptedLinkNoKey")}</span>
    </p>
  )
}
