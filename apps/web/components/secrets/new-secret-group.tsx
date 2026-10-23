"use client"

import { useTranslations } from "next-intl"
import { ListHeader } from "@/components/lists/toolbar"
import { SecretEditor } from "./secret-editor"

export function NewSecretGroup() {
  const t = useTranslations("Secrets")
  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <ListHeader title={t("new_group")} description={t("new_description")} />
      <SecretEditor />
    </div>
  )
}
