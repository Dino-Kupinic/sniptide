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
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { renderToken } from "@/components/paste/code-block"
import { LanguageIcon } from "@/components/paste/language-icon"
import { useHighlight } from "@/lib/highlight/use-highlight"
import { loadComparisonRevisions } from "@/lib/pastes/actions"
import { diffLines } from "@/lib/pastes/revision-diff"
import type { PasteFile } from "@/lib/pastes/types"

type Snapshot = { title: string; description: string; files: PasteFile[] }
type Revision = { id: number; message: string; snapshot: Snapshot | null }

function DiffSection({
  name,
  before,
  after,
  file,
  status,
  languageBefore,
  languageAfter,
}: {
  name: string
  before: string
  after: string
  file?: boolean
  status?: string
  languageBefore?: string
  languageAfter?: string
}) {
  const t = useTranslations("Paste")
  const oldHighlight = useHighlight(before, file ? name : "")
  const newHighlight = useHighlight(after, file ? name : "")
  const lines = useMemo(() => {
    let oldNumber = 0,
      newNumber = 0
    return diffLines(before, after).map((line) => ({
      ...line,
      oldNumber: line.kind === "added" ? null : ++oldNumber,
      newNumber: line.kind === "removed" ? null : ++newNumber,
    }))
  }, [before, after])
  const added = lines.filter((line) => line.kind === "added").length
  const removed = lines.filter((line) => line.kind === "removed").length
  return (
    <details open className="group/diff min-w-0 overflow-hidden rounded-lg border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 border-b border-transparent bg-sidebar px-3.5 py-2 text-sm group-open/diff:border-border [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40">
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 -rotate-90 transition-transform group-open/diff:rotate-0"
        />
        {file ? <LanguageIcon language={languageAfter ?? languageBefore ?? "text"} /> : null}
        <span className="min-w-0 truncate font-medium">{name}</span>
        {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
        {file ? (
          <span className="ml-auto flex shrink-0 gap-2 font-mono text-xs tabular-nums">
            <span
              className="text-green-700 dark:text-green-400"
              title={t("compareLinesAdded", { count: added })}
            >
              <span aria-hidden="true">+{added}</span>
              <span className="sr-only">{t("compareLinesAdded", { count: added })}</span>
            </span>
            <span
              className="text-red-700 dark:text-red-400"
              title={t("compareLinesRemoved", { count: removed })}
            >
              <span aria-hidden="true">−{removed}</span>
              <span className="sr-only">{t("compareLinesRemoved", { count: removed })}</span>
            </span>
          </span>
        ) : null}
      </summary>
      <div className="overflow-x-auto bg-muted py-4 font-mono text-[13px] leading-[22px] dark:bg-sidebar">
        <ol className="min-w-full w-max">
          {lines.map((line, index) => {
            const tokens =
              line.kind === "removed"
                ? oldHighlight?.[(line.oldNumber ?? 1) - 1]
                : newHighlight?.[(line.newNumber ?? 1) - 1]
            return (
              <li
                key={`${index}-${line.kind}`}
                className={`flex gap-[18px] px-4 ${line.kind === "added" ? "bg-green-500/15" : line.kind === "removed" ? "bg-red-500/15" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="w-8 shrink-0 select-none text-right text-muted-foreground tabular-nums"
                >
                  {line.oldNumber}
                </span>
                <span
                  aria-hidden="true"
                  className="w-8 shrink-0 select-none text-right text-muted-foreground tabular-nums"
                >
                  {line.newNumber}
                </span>
                <span aria-hidden="true" className="w-2 shrink-0 select-none">
                  {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
                </span>
                <code className="whitespace-pre">
                  {tokens?.length ? tokens.map(renderToken) : line.text || " "}
                </code>
              </li>
            )
          })}
        </ol>
      </div>
      {file && languageBefore !== languageAfter ? (
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {t("compareLanguage")}: {languageBefore ?? "—"} → {languageAfter ?? "—"}
        </div>
      ) : null}
    </details>
  )
}

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
          <DiffSection name={t("compareTitle")} before={a.title} after={b.title} />
          <DiffSection
            name={t("compareDescription")}
            before={a.description}
            after={b.description}
          />
          {Array.from(new Set([...a.files.map((f) => f.name), ...b.files.map((f) => f.name)])).map(
            (name) => {
              const oldFile = a.files.find((f) => f.name === name),
                newFile = b.files.find((f) => f.name === name)
              return (
                <DiffSection
                  key={name}
                  name={name}
                  file
                  before={oldFile?.content ?? ""}
                  after={newFile?.content ?? ""}
                  languageBefore={oldFile?.language}
                  languageAfter={newFile?.language}
                  status={!oldFile ? t("compareAdded") : !newFile ? t("compareRemoved") : undefined}
                />
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
