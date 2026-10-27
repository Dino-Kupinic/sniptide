"use client"

import { Button } from "@sniptide/ui/components/button"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@sniptide/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { loadComparisonRevisions } from "@/lib/pastes/actions"
import { diffLines } from "@/lib/pastes/revision-diff"
import type { PasteFile } from "@/lib/pastes/types"

type Snapshot = { title: string; description: string; files: PasteFile[] }
type Revision = { id: number; message: string; snapshot: Snapshot | null }

export function RevisionComparison({
  current,
  revisions,
}: {
  current: Snapshot
  revisions: Revision[]
}) {
  const t = useTranslations("Paste")
  const [before, setBefore] = useState(String(revisions[1]?.id ?? revisions[0]?.id ?? "current"))
  const [after, setAfter] = useState("current")
  const snapshot = (id: string) =>
    id === "current" ? current : revisions.find((r) => String(r.id) === id)?.snapshot
  const a = snapshot(before),
    b = snapshot(after)
  const items = [
    { value: "current", label: t("compareCurrent") },
    ...revisions.map((revision) => ({
      value: String(revision.id),
      label: `#${revision.id} · ${revision.message}`,
    })),
  ]
  const select = (label: string, value: string, update: (value: string) => void) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) update(next)
        }}
        items={items}
      >
        <SelectTrigger aria-label={label} className="w-full min-w-0">
          <SelectValue className="truncate" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
  const field = (name: string, oldValue: string, newValue: string) => (
    <section key={name} className="overflow-hidden rounded border border-border">
      <h3 className="border-b border-border bg-muted px-3 py-2 text-sm font-medium">{name}</h3>
      <pre className="overflow-x-auto py-2 text-xs leading-6">
        {diffLines(oldValue, newValue).map((line, index) => (
          <div
            key={`${index}-${line.kind}`}
            className={`min-w-max px-3 ${line.kind === "added" ? "bg-green-500/15" : line.kind === "removed" ? "bg-red-500/15" : ""}`}
          >
            <span className="mr-3 select-none">
              {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
            </span>
            {line.text || " "}
          </div>
        ))}
      </pre>
    </section>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {select(t("compareFrom"), before, setBefore)}
        {select(t("compareTo"), after, setAfter)}
      </div>
      {!a || !b ? (
        <p role="status">{t("compareUnavailable")}</p>
      ) : before === after ? (
        <p role="status">{t("compareChooseTwo")}</p>
      ) : (
        <>
          {field(t("compareTitle"), a.title, b.title)}
          {field(t("compareDescription"), a.description, b.description)}
          {Array.from(new Set([...a.files.map((f) => f.name), ...b.files.map((f) => f.name)])).map(
            (name) => {
              const oldFile = a.files.find((f) => f.name === name),
                newFile = b.files.find((f) => f.name === name)
              return (
                <div key={name} className="flex flex-col gap-2">
                  <p className="text-sm font-medium">
                    {name} ·{" "}
                    {t(!oldFile ? "compareAdded" : !newFile ? "compareRemoved" : "compareFile")}
                  </p>
                  {oldFile?.language !== newFile?.language
                    ? field(t("compareLanguage"), oldFile?.language ?? "", newFile?.language ?? "")
                    : null}
                  {field(name, oldFile?.content ?? "", newFile?.content ?? "")}
                </div>
              )
            },
          )}
          {a.title === b.title &&
          a.description === b.description &&
          a.files.length === b.files.length &&
          a.files.every((file, index) => {
            const other = b.files[index]
            return (
              other &&
              file.name === other.name &&
              file.language === other.language &&
              file.content === other.content
            )
          }) ? (
            <p role="status">{t("compareIdentical")}</p>
          ) : null}
        </>
      )}
    </div>
  )
}

export function CompareRevisions({ slug, current }: { slug: string; current: Snapshot }) {
  const t = useTranslations("Paste")
  const [open, setOpen] = useState(false)
  const [revisions, setRevisions] = useState<Revision[] | null>(null)
  const [error, setError] = useState(false)
  async function show() {
    setOpen(true)
    setError(false)
    setRevisions(null)
    try {
      const rows = await loadComparisonRevisions(slug)
      if (!rows) setError(true)
      else setRevisions(rows)
    } catch {
      setError(true)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" className="mb-3" onClick={show}>
        {t("compareRevisions")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[85dvh] max-w-4xl overflow-y-auto"
        >
          <DialogTitle>{t("compareRevisions")}</DialogTitle>
          {error ? (
            <p role="alert">{t("compareError")}</p>
          ) : revisions ? (
            <RevisionComparison current={current} revisions={revisions} />
          ) : (
            <p role="status">{t("compareLoading")}</p>
          )}
          <DialogClose render={<Button variant="outline" />}>{t("compareClose")}</DialogClose>
        </DialogContent>
      </Dialog>
    </>
  )
}
