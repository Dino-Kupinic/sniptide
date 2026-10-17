"use client"

import { Button } from "@sniptide/ui/components/button"
import { PlusIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { z } from "zod"
import { parseEnvFile } from "@/lib/env/dotenv"
import type { SecretDetail } from "@/lib/env/web-store"
import { fieldClass, secretRequest } from "./client"

export function SecretEditor({
  group,
  onSaved,
  onCancel,
}: {
  group?: SecretDetail
  onSaved?: () => void
  onCancel?: () => void
}) {
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
      setError("Check the .env syntax and size limits.")
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
          setError(error instanceof Error ? error.message : "Could not save.")
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-2 text-sm">
          Group name
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
          Project
          <input
            name="project"
            className={fieldClass}
            defaultValue={group?.project ?? ""}
            required
            maxLength={100}
            placeholder="My app"
          />
        </label>
        <label className="space-y-2 text-sm">
          Environment
          <select
            name="environment"
            className={fieldClass}
            defaultValue={group?.environment ?? "dev"}
          >
            <option value="dev">Development</option>
            <option value="staging">Staging</option>
            <option value="prod">Production</option>
          </select>
        </label>
      </div>
      <div>
        <h2 className="font-medium">Variables</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {group
            ? "Leave a value blank to keep it. Select Clear value to save an empty value."
            : "Values are encrypted before storage."}
        </p>
      </div>
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <div
            key={entry.key}
            className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <label className="space-y-1 text-xs text-muted-foreground">
              Variable name
              <input
                className={`${fieldClass} font-mono`}
                aria-label={`Variable name ${index + 1}`}
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
              {entry.existing ? "New value" : "Value"}
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
                placeholder={entry.existing ? "Keep current value" : "Enter value"}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              className="self-end"
              aria-label={`Remove variable ${index + 1}`}
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
                Clear value
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
        Add variable
      </Button>
      <details className="border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">Paste a .env file</summary>
        <label className="mt-3 block space-y-2 text-sm">
          File contents
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
          Import variables
        </Button>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save secrets"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            render={<Link href={group ? `/secrets/${group.id}` : "/secrets"} />}
            nativeButton={false}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
