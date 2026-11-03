"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@sniptide/ui/components/alert-dialog"
import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Textarea } from "@sniptide/ui/components/textarea"
import { toast } from "@sniptide/ui/components/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import {
  ChevronLeftIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import { z } from "zod"
import { ListHeader, SearchField } from "@/components/lists/toolbar"
import type { SecretDetail as Detail } from "@/lib/env/web-store"
import { copyText } from "@/lib/feedback"
import {
  ENVIRONMENTS,
  type Environment,
  SecretRequestError,
  useSecretRequest,
  useSecretValues,
} from "./client"
import { Panel } from "./panel"
import { SecretSharing } from "./secret-sharing"
import { type DraftRow, draftRow, filledRows, VariableRows } from "./variable-rows"

type Change = {
  entries?: { name: string; value: string; replace: true }[]
  deleted?: string[]
  project?: string
  environment?: Environment
}

// One secret group, laid out like Vercel's environment variables page: a form to add variables
// at the top, then every variable with its value masked, revealed or copied in place, edited
// inline and deleted after a confirmation.
export function SecretDetail({ group }: { group: Detail }) {
  const t = useTranslations("Secrets")
  const coreT = useTranslations("Core")
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const { values, setValues, clear, begin } = useSecretValues()
  const [rows, setRows] = useState<DraftRow[]>(() => [draftRow()])
  const [filter, setFilter] = useState("")
  const [editing, setEditing] = useState<{ name: string; value: string; from: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const names = new Set(group.entries.map((entry) => entry.name))
  const visible = group.entries.filter((entry) =>
    entry.name.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  async function save(change: Change, task: string, success: string) {
    setBusy(task)
    setError("")
    try {
      await secretRequest({
        operation: "save",
        id: group.id,
        input: {
          slug: group.slug,
          project: change.project,
          environment: change.environment,
          revision: group.revision,
          entries: change.entries ?? [],
          deleted: change.deleted ?? [],
        },
      })
      toast.success(success)
      router.refresh()
      return true
    } catch (error) {
      setError(error instanceof SecretRequestError ? error.message : t("save_error"))
      return false
    } finally {
      setBusy(null)
    }
  }
  async function fetchValue(name: string) {
    const active = begin()
    try {
      const result = z
        .object({ value: z.string() })
        .parse(await secretRequest({ operation: "reveal", id: group.id, name }))
      return active() ? result.value : null
    } catch {
      toast.error(t("reveal_error"))
      return null
    }
  }
  async function toggle(name: string) {
    if (Object.hasOwn(values, name)) {
      setValues((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([key]) => key !== name)),
      )
      return
    }
    const value = await fetchValue(name)
    if (value !== null) setValues((previous) => ({ ...previous, [name]: value }))
  }
  async function copy(name: string) {
    const value = Object.hasOwn(values, name) ? values[name] : await fetchValue(name)
    if (value === null || value === undefined) return
    await copyText(value, { success: t("copied", { name }), error: coreT("copyError") })
  }
  async function edit(name: string) {
    setBusy(`edit:${name}`)
    const value = Object.hasOwn(values, name) ? values[name] : await fetchValue(name)
    setBusy(null)
    if (value === null || value === undefined) return
    setError("")
    setEditing({ name, value, from: name })
  }

  return (
    <div className="ph-no-capture flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <div className="flex flex-col gap-3">
        <Link
          href="/secrets"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <ListHeader
          title={group.slug}
          count={group.entries.length}
          description={`${group.project ?? t("ungrouped")} · ${
            group.environment ? t(group.environment) : t("no_environment")
          }`}
        />
      </div>

      <Panel title={t("add_variables")}>
        <form
          autoComplete="off"
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const filled = filledRows(rows).map((row) => ({ ...row, name: row.name.trim() }))
            if (filled.length === 0) return
            const seen = new Set<string>()
            for (const row of filled) {
              if (names.has(row.name) || seen.has(row.name))
                return setError(t("exists_error", { name: row.name }))
              seen.add(row.name)
            }
            const saved = await save(
              {
                entries: filled.map(({ name, value }) => ({ name, value, replace: true })),
              },
              "add",
              t("added", { count: filled.length }),
            )
            if (saved) setRows([draftRow()])
          }}
        >
          <VariableRows rows={rows} onChange={setRows} disabled={busy === "add"} />
          <div className="flex justify-end">
            <Button type="submit" loading={busy === "add"} disabled={!filledRows(rows).length}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Panel>

      <FormError message={error} />

      <section aria-labelledby="secret-variables" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="secret-variables" className="font-heading text-xl font-bold tracking-[-0.02em]">
            {t("variables")}
          </h2>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {Object.keys(values).length > 0 ? (
              <Button variant="ghost" onClick={clear}>
                <EyeOffIcon />
                {t("hide_all")}
              </Button>
            ) : null}
            <SearchField
              className="flex-1 sm:flex-none"
              value={filter}
              onChange={setFilter}
              placeholder={t("filter_variables")}
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          {group.entries.length === 0 || visible.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-muted-foreground">
              {group.entries.length === 0 ? t("no_variables") : t("no_variable_matches")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((entry) =>
                editing?.from === entry.name ? (
                  <li key={entry.name} className="flex flex-col gap-3 bg-muted/40 p-4">
                    <form
                      autoComplete="off"
                      className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        const name = editing.name.trim()
                        if (name !== entry.name && names.has(name))
                          return setError(t("exists_error", { name }))
                        const saved = await save(
                          {
                            entries: [{ name, value: editing.value, replace: true }],
                            deleted: name === entry.name ? [] : [entry.name],
                          },
                          `save:${entry.name}`,
                          t("updated", { name }),
                        )
                        if (saved) setEditing(null)
                      }}
                    >
                      <Input
                        aria-label={t("key")}
                        className="font-mono"
                        spellCheck={false}
                        required
                        pattern="[A-Za-z_][A-Za-z0-9_]*"
                        value={editing.name}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      />
                      {editing.value.includes("\n") ? (
                        <Textarea
                          aria-label={t("value")}
                          className="font-mono"
                          spellCheck={false}
                          value={editing.value}
                          onChange={(event) =>
                            setEditing({ ...editing, value: event.target.value })
                          }
                        />
                      ) : (
                        <Input
                          aria-label={t("value")}
                          className="font-mono"
                          spellCheck={false}
                          data-1p-ignore
                          autoFocus
                          value={editing.value}
                          onChange={(event) =>
                            setEditing({ ...editing, value: event.target.value })
                          }
                        />
                      )}
                      <div className="flex justify-end gap-2 sm:col-span-2">
                        <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                          {t("cancel")}
                        </Button>
                        <Button type="submit" loading={busy === `save:${entry.name}`}>
                          {t("save")}
                        </Button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li
                    key={entry.name}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]"
                  >
                    <span title={entry.name} className="truncate font-mono text-[13px] font-medium">
                      {entry.name}
                    </span>
                    <div className="col-span-2 row-start-2 flex min-w-0 items-start gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:items-center">
                      <IconButton
                        label={t(Object.hasOwn(values, entry.name) ? "hide_name" : "reveal_name", {
                          name: entry.name,
                        })}
                        onClick={() => void toggle(entry.name)}
                      >
                        {Object.hasOwn(values, entry.name) ? <EyeOffIcon /> : <EyeIcon />}
                      </IconButton>
                      {Object.hasOwn(values, entry.name) ? (
                        <span className="max-h-48 min-w-0 flex-1 overflow-auto py-1 font-mono text-[13px] break-all whitespace-pre-wrap">
                          {values[entry.name] || (
                            <span className="text-muted-foreground">{t("empty_value")}</span>
                          )}
                        </span>
                      ) : (
                        <span className="font-mono text-[13px] tracking-widest text-muted-foreground">
                          <span aria-hidden="true">••••••••••••</span>
                          <span className="sr-only">{t("masked")}</span>
                        </span>
                      )}
                    </div>
                    <div className="col-start-2 row-start-1 flex items-center gap-0.5 sm:col-start-3">
                      <IconButton
                        label={t("copy_name", { name: entry.name })}
                        onClick={() => void copy(entry.name)}
                      >
                        <CopyIcon />
                      </IconButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={t("actions_for", { name: entry.name })}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
                        >
                          <MoreHorizontalIcon className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={busy === `edit:${entry.name}`}
                            onClick={() => void edit(entry.name)}
                          >
                            <PencilIcon />
                            {t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRemoving(entry.name)}
                          >
                            <Trash2Icon />
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </section>

      <GroupSettings
        group={group}
        busy={busy === "settings"}
        onSave={(project, environment) =>
          save({ project, environment }, "settings", t("settings_saved"))
        }
      />

      <SecretSharing group={group} />

      <DeleteGroup group={group} />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {t("delete_variable_title", { name: removing ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("delete_variable_notice")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="lg" />}>
              {t("cancel")}
            </AlertDialogClose>
            <Button
              size="lg"
              variant="destructive"
              loading={busy === "remove"}
              onClick={async () => {
                if (!removing) return
                if (await save({ deleted: [removing] }, "remove", t("deleted", { name: removing })))
                  setRemoving(null)
              }}
            >
              {t("delete_variable")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className="text-muted-foreground hover:text-foreground"
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function GroupSettings({
  group,
  busy,
  onSave,
}: {
  group: Detail
  busy: boolean
  onSave: (project: string, environment: Environment) => Promise<boolean>
}) {
  const t = useTranslations("Secrets")
  const [project, setProject] = useState(group.project ?? "")
  const [environment, setEnvironment] = useState<Environment>(group.environment ?? "dev")
  const changed = project.trim() !== (group.project ?? "") || environment !== group.environment
  return (
    <Panel title={t("settings")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave(project.trim(), environment)
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="secret-project">{t("project")}</Label>
            <Input
              id="secret-project"
              required
              maxLength={100}
              placeholder={t("project_placeholder")}
              value={project}
              onChange={(event) => setProject(event.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span id="secret-environment" className="text-[13px] leading-[18px] font-medium">
              {t("environment")}
            </span>
            <SegmentedControl
              aria-labelledby="secret-environment"
              value={environment}
              onValueChange={setEnvironment}
              options={ENVIRONMENTS.map((value) => ({ value, label: t(value) }))}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={busy} disabled={!changed}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

function DeleteGroup({ group }: { group: Detail }) {
  const t = useTranslations("Secrets")
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{t("delete_group")}</h2>
        <p className="text-sm text-muted-foreground">{t("delete_notice")}</p>
      </div>
      <Button
        variant="destructive"
        className="self-start sm:self-auto"
        onClick={() => setOpen(true)}
      >
        {t("delete_group")}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setConfirm("")
            setError("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t("delete_group_title", { name: group.slug })}</AlertDialogTitle>
          <AlertDialogDescription>{t("delete_notice")}</AlertDialogDescription>
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret-delete-confirm">
              {t.rich("delete_confirm", {
                name: group.slug,
                code: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </Label>
            <Input
              id="secret-delete-confirm"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <FormError variant="inline" message={error} />
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="lg" />}>
              {t("cancel")}
            </AlertDialogClose>
            <Button
              size="lg"
              variant="destructive"
              loading={busy}
              disabled={confirm !== group.slug}
              onClick={async () => {
                setBusy(true)
                try {
                  await secretRequest({ operation: "delete", id: group.id })
                  toast.success(t("group_deleted", { name: group.slug }))
                  router.push("/secrets")
                  router.refresh()
                } catch {
                  setError(t("delete_error"))
                  setBusy(false)
                }
              }}
            >
              {t("permanently_delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
