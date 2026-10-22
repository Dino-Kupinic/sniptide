"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import { ENVIRONMENTS, type Environment, SecretRequestError, useSecretRequest } from "./client"
import { type DraftRow, draftRow, filledRows, VariableRows } from "./variable-rows"

// The new group form: a name, the project and environment it belongs to, and its first variables.
export function SecretEditor() {
  const t = useTranslations("Secrets")
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const [environment, setEnvironment] = useState<Environment>("dev")
  const [rows, setRows] = useState<DraftRow[]>(() => [draftRow()])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
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
              id: null,
              input: {
                slug: fields.get("slug"),
                project: fields.get("project"),
                environment,
                entries: filledRows(rows).map(({ name, value }) => ({
                  name: name.trim(),
                  value,
                  replace: true,
                })),
                deleted: [],
              },
            }),
          )
          setRows([draftRow()])
          router.push(`/secrets/${result.id}`)
          router.refresh()
        } catch (error) {
          setError(error instanceof SecretRequestError ? error.message : t("save_error"))
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-[560px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="secret-slug">{t("group_name")}</Label>
          <Input
            id="secret-slug"
            name="slug"
            className="font-mono"
            required
            pattern={"[a-z0-9][a-z0-9._\\-]{0,63}"}
            placeholder="my-app-dev"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="secret-project">{t("project")}</Label>
          <Input
            id="secret-project"
            name="project"
            required
            maxLength={100}
            placeholder={t("project_placeholder")}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span id="secret-environment" className="text-[13px] leading-[18px] font-medium">
          {t("environment")}
        </span>
        <SegmentedControl
          aria-labelledby="secret-environment"
          className="lg:max-w-[560px]"
          value={environment}
          onValueChange={setEnvironment}
          options={ENVIRONMENTS.map((value) => ({ value, label: t(value) }))}
        />
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("variables")}</h2>
        <VariableRows rows={rows} onChange={setRows} disabled={busy} />
      </section>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="lg" loading={busy}>
          {t("create_group")}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          render={<Link href="/secrets" />}
          nativeButton={false}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  )
}
