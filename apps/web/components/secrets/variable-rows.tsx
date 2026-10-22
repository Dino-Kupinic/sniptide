"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { toast } from "@sniptide/ui/components/toast"
import { FileUpIcon, MinusCircleIcon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRef } from "react"
import { parseEnvFile } from "@/lib/env/dotenv"

export type DraftRow = { key: string; name: string; value: string }

export const draftRow = (name = "", value = ""): DraftRow => ({
  key: crypto.randomUUID(),
  name,
  value,
})

// Rows filled with something, ready to send.
export const filledRows = (rows: DraftRow[]) => rows.filter((row) => row.name || row.value)

// Key and value pairs for adding variables, as on Vercel: paste a whole .env file into any key
// field, or import one from disk, and every variable becomes its own row.
export function VariableRows({
  rows,
  onChange,
  disabled,
}: {
  rows: DraftRow[]
  onChange: (rows: DraftRow[]) => void
  disabled?: boolean
}) {
  const t = useTranslations("Secrets")
  const file = useRef<HTMLInputElement>(null)
  function merge(text: string, at?: string) {
    let imported: { name: string; value: string }[]
    try {
      imported = parseEnvFile(text)
    } catch {
      toast.error(t("syntax_error"))
      return false
    }
    if (imported.length === 0) return false
    const next = rows.filter((row) => row.key !== at && (row.name || row.value))
    for (const entry of imported) {
      const index = next.findIndex((row) => row.name === entry.name)
      if (index >= 0) next[index] = { ...(next[index] as DraftRow), value: entry.value }
      else next.push(draftRow(entry.name, entry.value))
    }
    onChange(next)
    toast.success(t("imported", { count: imported.length }))
    return true
  }
  const update = (key: string, patch: Partial<DraftRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2rem] gap-2 text-[13px] font-medium text-muted-foreground sm:grid">
        <span>{t("key")}</span>
        <span>{t("value")}</span>
      </div>
      {rows.map((row, index) => (
        <div
          key={row.key}
          className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2rem]"
        >
          <Input
            aria-label={t("variable_name_index", { index: index + 1 })}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            placeholder="API_KEY"
            value={row.name}
            disabled={disabled}
            onChange={(event) => update(row.key, { name: event.target.value })}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text")
              if (!/[=\n]/.test(text)) return
              event.preventDefault()
              if (!merge(text, row.key)) update(row.key, { name: text.trim() })
            }}
          />
          <Input
            aria-label={t("variable_value_index", { index: index + 1 })}
            className="col-start-1 row-start-2 font-mono sm:col-start-2 sm:row-start-1"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            placeholder={t("value")}
            value={row.value}
            disabled={disabled}
            onChange={(event) => update(row.key, { value: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="col-start-2 row-start-1 self-center text-muted-foreground sm:col-start-3"
            aria-label={t("remove_variable_index", { index: index + 1 })}
            disabled={disabled || (rows.length === 1 && !row.name && !row.value)}
            onClick={() =>
              onChange(rows.length === 1 ? [draftRow()] : rows.filter((r) => r.key !== row.key))
            }
          >
            <MinusCircleIcon />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...rows, draftRow()])}
        >
          <PlusIcon />
          {t("add_another")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => file.current?.click()}
        >
          <FileUpIcon />
          {t("import_env")}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".env,.txt,text/plain"
          className="hidden"
          aria-label={t("import_env")}
          onChange={async (event) => {
            const picked = event.target.files?.[0]
            event.target.value = ""
            if (picked) merge(await picked.text())
          }}
        />
        <p className="text-[13px] text-muted-foreground">{t("paste_hint")}</p>
      </div>
    </div>
  )
}
