"use client"

import { Button } from "@sniptide/ui/components/button"
import { toast } from "@sniptide/ui/components/toast"
import { ChevronLeftIcon, CopyIcon, EyeIcon, EyeOffIcon, PencilIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import type { SecretDetail as Detail } from "@/lib/env/web-store"
import { useSecretRequest, useSecretValues } from "./client"
import { SecretEditor } from "./secret-editor"
import { SecretSharing } from "./secret-sharing"

export function SecretDetail({ group }: { group: Detail }) {
  const t = useTranslations("Secrets")
  const secretRequest = useSecretRequest()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const { values, setValues, clear, begin } = useSecretValues()
  async function reveal(name: string, copy: boolean) {
    const active = begin()
    try {
      const result = z
        .object({ value: z.string() })
        .parse(await secretRequest({ operation: "reveal", id: group.id, name }))
      if (!active()) return
      if (copy) {
        await navigator.clipboard.writeText(result.value)
        toast.success(t("value_copied", { name }))
      } else setValues((previous) => ({ ...previous, [name]: result.value }))
      setError("")
    } catch {
      setError(t("reveal_error"))
    }
  }
  const revealed = (name: string) => Object.hasOwn(values, name)
  return (
    <div className="ph-no-capture mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 pt-4 pb-8 lg:p-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/secrets"
          className="-ml-2 inline-flex h-10 items-center gap-1 self-start rounded-lg px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ChevronLeftIcon className="size-4" />
          {t("title")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] break-all">
              {group.slug}
            </h1>
            <p className="text-sm text-muted-foreground">
              {group.project ?? t("ungrouped")} · {group.environment ?? t("no_environment")}
            </p>
          </div>
          <Button
            variant="outline"
            size="xl"
            onClick={() => {
              clear()
              setEditing(!editing)
            }}
          >
            {editing ? <XIcon /> : <PencilIcon />}
            {editing ? t("close_editor") : t("edit_group")}
          </Button>
        </div>
      </div>
      {editing ? (
        <SecretEditor
          key={group.revision}
          group={group}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-muted-foreground">{t("hide_notice")}</p>
            <Button variant="ghost" size="xl" className="-mr-2" onClick={clear}>
              <EyeOffIcon />
              {t("hide_all")}
            </Button>
          </div>
          <ul className="overflow-hidden rounded-lg divide-y divide-border border border-border">
            {group.entries.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">{t("no_variables")}</li>
            )}
            {group.entries.map((entry) => (
              <li
                key={entry.name}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-mono text-sm font-medium break-all">{entry.name}</h2>
                  <p className="mt-1 max-h-48 overflow-auto font-mono text-sm break-all whitespace-pre-wrap text-muted-foreground">
                    {revealed(entry.name) ? values[entry.name] || t("empty_value") : "••••••••••••"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="xl"
                    variant="outline"
                    className="max-sm:flex-1"
                    onClick={() =>
                      revealed(entry.name)
                        ? setValues((previous) =>
                            Object.fromEntries(
                              Object.entries(previous).filter(([name]) => name !== entry.name),
                            ),
                          )
                        : void reveal(entry.name, false)
                    }
                  >
                    {revealed(entry.name) ? <EyeOffIcon /> : <EyeIcon />}
                    {revealed(entry.name) ? t("hide") : t("reveal")}
                  </Button>
                  <Button
                    size="xl"
                    variant="outline"
                    className="max-sm:flex-1"
                    onClick={() => reveal(entry.name, true)}
                  >
                    <CopyIcon />
                    {t("copy")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SecretSharing group={group} />
    </div>
  )
}
