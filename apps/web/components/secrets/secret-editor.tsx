"use client"

import { Button } from "@sniptide/ui/components/button"
import { PlusIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import { parseEnvFile } from "@/lib/env/dotenv"
import type { SecretDetail } from "@/lib/env/web-store"
import { fieldClass, SecretRequestError, useSecretRequest } from "./client"

export function SecretEditor({
  group,
  onSaved,
  onCancel,
}: {
  group?: SecretDetail
  onSaved?: () => void
  onCancel?: () => void
}) {
  const t = useTranslations("Secrets")
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const [entries, setEntries] = useState(
    () =>
      group?.entries.map((entry) => ({
        ...entry,
        value: "",
        replace: false,
        existing: true,
        key: crypto.randomUUID(),
      })) ?? [{ name: "", value: "", replace: false, existing: false, key: crypto.randomUUID() }],
  )
  const [deleted, setDeleted] = useState<string[]>([])
  const [source, setSource] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  function importFile() {
    try {
      const imported = parseEnvFile(source)
      setEntries((previous) => {
        const next = [...previous.filter((entry) => entry.name || entry.value)]
        for (const entry of imported) {
          const index = next.findIndex((row) => row.name === entry.name)
          const row = {
            ...entry,
            replace: true,
            existing: index >= 0 ? (next[index]?.existing ?? false) : false,
            key: crypto.randomUUID(),
          }
          if (index >= 0) next[index] = row
          else next.push(row)
        }
        return next
      })
      setSource("")
      setError("")
    } catch {
      setError(t("syntax_error"))
    }
  }
  return (
    <form
      autoComplete="off"
      className="ph-no-capture space-y-6"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError("")
        const fields = new FormData(event.currentTarget)
        try {
          const result = z.object({ id: z.string() }).parse(
            await secretRequest({
              operation: "save",
              id: group?.id ?? null,
              input: {
                slug: group?.slug ?? fields.get("slug"),
                project: fields.get("project"),
                environment: fields.get("environment"),
                revision: group?.revision,
                entries: entries
                  .filter((entry) => entry.name || entry.value)
                  .map(({ name, value, replace }) => ({ name, value, replace })),
                deleted,
              },
            }),
          )
          setEntries([])
          setSource("")
          onSaved?.()
          router.push(`/secrets/${result.id}`)
          router.refresh()
        } catch (error) {
          setError(error instanceof SecretRequestError ? error.message : t("save_error"))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-2 text-sm">
          {t("group_name")}
          <input
            name="slug"
            className={fieldClass}
            defaultValue={group?.slug}
            disabled={Boolean(group)}
            required
            pattern={"[a-z0-9][a-z0-9._\\-]{0,63}"}
            placeholder="my-app-dev"
          />
        </label>
        <label className="space-y-2 text-sm">
          {t("project")}
          <input
            name="project"
            className={fieldClass}
            defaultValue={group?.project ?? ""}
            required
            maxLength={100}
            placeholder={t("project_placeholder")}
          />
        </label>
        <label className="space-y-2 text-sm">
          {t("environment")}
          <select
            name="environment"
            className={fieldClass}
            defaultValue={group?.environment ?? "dev"}
          >
            <option value="dev">{t("dev")}</option>
            <option value="staging">{t("staging")}</option>
            <option value="prod">{t("prod")}</option>
          </select>
        </label>
      </div>
      <div>
        <h2 className="font-medium">{t("variables")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {group ? t("keep_values") : t("encrypted_notice")}
        </p>
      </div>
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <div
            key={entry.key}
            className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("variable_name")}
              <input
                className={`${fieldClass} font-mono`}
                aria-label={t("variable_name_index", { index: index + 1 })}
                value={entry.name}
                readOnly={entry.existing}
                onChange={(event) =>
                  setEntries((rows) =>
                    rows.map((row) =>
                      row.key === entry.key ? { ...row, name: event.target.value } : row,
                    ),
                  )
                }
                placeholder="API_KEY"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {entry.existing ? t("new_value") : t("value")}
              <input
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                className={`${fieldClass} font-mono`}
                value={entry.value}
                disabled={entry.existing && entry.replace && entry.value === ""}
                onChange={(event) =>
                  setEntries((rows) =>
                    rows.map((row) =>
                      row.key === entry.key ? { ...row, value: event.target.value } : row,
                    ),
                  )
                }
                placeholder={entry.existing ? t("keep_value") : t("enter_value")}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              className="self-end"
              aria-label={t("remove_variable_index", { index: index + 1 })}
              onClick={() => {
                if (entry.existing) setDeleted((names) => [...names, entry.name])
                setEntries((rows) => rows.filter((row) => row.key !== entry.key))
              }}
            >
              <Trash2Icon />
            </Button>
            {entry.existing && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
                <input
                  type="checkbox"
                  checked={entry.replace && entry.value === ""}
                  onChange={(event) =>
                    setEntries((rows) =>
                      rows.map((row) =>
                        row.key === entry.key
                          ? { ...row, value: "", replace: event.target.checked }
                          : row,
                      ),
                    )
                  }
                />
                {t("clear_value")}
              </label>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setEntries((rows) => [
            ...rows,
            { name: "", value: "", replace: false, existing: false, key: crypto.randomUUID() },
          ])
        }
      >
        <PlusIcon />
        {t("add_variable")}
      </Button>
      <details className="border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t("paste_file")}</summary>
        <label className="mt-3 block space-y-2 text-sm">
          {t("file_contents")}
          <textarea
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} h-36 py-3 font-mono`}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder={'API_KEY="your value"'}
          />
        </label>
        <Button type="button" variant="outline" className="mt-3" onClick={importFile}>
          {t("import_variables")}
        </Button>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            render={<Link href={group ? `/secrets/${group.id}` : "/secrets"} />}
            nativeButton={false}
          >
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  )
}
