"use client"

import { Button } from "@sniptide/ui/components/button"
import { Checkbox } from "@sniptide/ui/components/checkbox"
import { Input } from "@sniptide/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { Textarea } from "@sniptide/ui/components/textarea"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { z } from "zod"
import { parseEnvFile } from "@/lib/env/dotenv"
import type { SecretDetail } from "@/lib/env/web-store"
import { SecretRequestError, useSecretRequest } from "./client"

// 16px text on phones so iOS doesn't zoom into the field on focus.
const fieldText = "text-base lg:text-sm"

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
  const [importOpen, setImportOpen] = useState(false)
  // Saving keeps the form as it is until the group's page has loaded, so a slow navigation never
  // looks like a save that emptied the form.
  const [navigating, startNavigation] = useTransition()
  const environments = [
    { value: "dev", label: t("dev") },
    { value: "staging", label: t("staging") },
    { value: "prod", label: t("prod") },
  ]
  const updateEntry = (key: string, patch: Partial<(typeof entries)[number]>) =>
    setEntries((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
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
      setImportOpen(false)
    } catch {
      setError(t("syntax_error"))
    }
  }
  return (
    <form
      autoComplete="off"
      className="ph-no-capture flex flex-col gap-6"
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
          toast.success(t("saved"))
          onSaved?.()
          startNavigation(() => {
            router.push(`/secrets/${result.id}`)
            router.refresh()
          })
        } catch (error) {
          const message = error instanceof SecretRequestError ? error.message : t("save_error")
          setError(message)
          toast.error(message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the Input inside is the control */}
        <label className="flex flex-col gap-2 text-sm font-medium">
          {t("group_name")}
          <Input
            name="slug"
            className={cn("font-mono", fieldText)}
            defaultValue={group?.slug}
            disabled={Boolean(group)}
            required
            pattern={"[a-z0-9][a-z0-9._\\-]{0,63}"}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="my-app-dev"
          />
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the Input inside is the control */}
        <label className="flex flex-col gap-2 text-sm font-medium">
          {t("project")}
          <Input
            name="project"
            className={fieldText}
            defaultValue={group?.project ?? ""}
            required
            maxLength={100}
            placeholder={t("project_placeholder")}
          />
        </label>
        <div className="flex flex-col gap-2 text-sm font-medium">
          <span id="secret-environment">{t("environment")}</span>
          <Select
            name="environment"
            defaultValue={group?.environment ?? "dev"}
            items={environments}
          >
            <SelectTrigger
              aria-labelledby="secret-environment"
              className={cn("h-10 w-full font-normal", fieldText)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {environments.map((environment) => (
                <SelectItem key={environment.value} value={environment.value} className="h-10">
                  {environment.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">{t("variables")}</h2>
        <p className="text-sm text-muted-foreground">
          {group ? t("keep_values") : t("encrypted_notice")}
        </p>
      </div>
      {entries.length > 0 ? (
        <ul className="overflow-hidden rounded-lg divide-y divide-border border border-border">
          {entries.map((entry, index) => (
            <li
              key={entry.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <Input
                className={cn("font-mono", fieldText)}
                aria-label={t("variable_name_index", { index: index + 1 })}
                value={entry.name}
                readOnly={entry.existing}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => updateEntry(entry.key, { name: event.target.value })}
                placeholder="API_KEY"
              />
              <Input
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                aria-label={entry.existing ? t("new_value") : t("value")}
                className={cn("col-start-1 font-mono sm:col-start-auto", fieldText)}
                value={entry.value}
                disabled={entry.existing && entry.replace && entry.value === ""}
                onChange={(event) => updateEntry(entry.key, { value: event.target.value })}
                placeholder={entry.existing ? t("keep_value") : t("enter_value")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="col-start-2 row-start-1 size-10 text-muted-foreground sm:col-start-3"
                aria-label={t("remove_variable_index", { index: index + 1 })}
                onClick={() => {
                  if (entry.existing) setDeleted((names) => [...names, entry.name])
                  setEntries((rows) => rows.filter((row) => row.key !== entry.key))
                }}
              >
                <Trash2Icon />
              </Button>
              {entry.existing && (
                // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox inside is the control
                <label className="col-span-full flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={entry.replace && entry.value === ""}
                    onCheckedChange={(checked) =>
                      updateEntry(entry.key, { value: "", replace: checked })
                    }
                  />
                  {t("clear_value")}
                </label>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="xl"
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
        <Button
          type="button"
          variant="ghost"
          size="xl"
          aria-expanded={importOpen}
          aria-controls="secret-import"
          onClick={() => setImportOpen((open) => !open)}
        >
          {t("paste_file")}
          <ChevronDownIcon
            className={cn(
              "text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              importOpen && "rotate-180",
            )}
          />
        </Button>
      </div>
      {importOpen ? (
        <div id="secret-import" className="flex flex-col gap-3">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the Textarea inside is the control */}
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t("file_contents")}
            <Textarea
              autoComplete="off"
              spellCheck={false}
              className={cn("h-36 font-mono", fieldText)}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={'API_KEY="your value"'}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="xl"
            className="self-start"
            onClick={importFile}
          >
            {t("import_variables")}
          </Button>
        </div>
      ) : null}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {/* A 56px bottom bar on phones, as in the paste editor, so Save stays in reach however many
          variables there are. It covers the tab bar while a group is edited in place. */}
      <div className="fixed inset-x-0 bottom-0 z-40 box-content flex h-14 items-center gap-2 border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:static lg:z-auto lg:h-auto lg:border-0 lg:bg-transparent lg:p-0">
        <Button type="submit" size="xl" className="max-lg:flex-1" loading={busy || navigating}>
          {busy || navigating ? t("saving") : t("save")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" size="xl" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xl"
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
