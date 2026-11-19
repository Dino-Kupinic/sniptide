"use client"

import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { useTranslations } from "next-intl"
import * as React from "react"
import { TemplateCard, useTemplateLabels } from "@/components/dashboard/templates-widget"
import { SearchField } from "@/components/lists/toolbar"
import type { TemplateSummary } from "@/lib/pastes/templates"
import {
  isTemplateDepartment,
  matchesTemplateQuery,
  TEMPLATE_DEPARTMENTS,
  type TemplateDepartment,
} from "@/lib/template-filter"

type DepartmentFilter = TemplateDepartment | "all"

// The URL keeps the filters (?department=product&q=docker), as on the website's directory, so the
// back button and a shared link restore them.
function writeParams(department: DepartmentFilter, query: string) {
  const params = new URLSearchParams()
  if (department !== "all") params.set("department", department)
  if (query.trim()) params.set("q", query.trim())
  const search = params.toString()
  window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname)
}

// The templates directory inside the app: the website's department filter and search above every
// template, each opening the editor filled with its files.
export function TemplateCatalog({
  templates,
  initialDepartment,
  initialQuery,
}: {
  templates: TemplateSummary[]
  initialDepartment?: string
  initialQuery?: string
}) {
  const t = useTranslations("Workspace")
  const labels = useTemplateLabels()
  const [department, setDepartment] = React.useState<DepartmentFilter>(
    isTemplateDepartment(initialDepartment) ? initialDepartment : "all",
  )
  const [query, setQuery] = React.useState(initialQuery ?? "")

  const visible = templates.filter(
    (template) =>
      (department === "all" || template.department === department) &&
      matchesTemplateQuery(
        template,
        [labels.category(template.category), labels.department(template.department)].filter(
          (label): label is string => label !== null,
        ),
        query,
      ),
  )
  const count = (key: DepartmentFilter) =>
    key === "all"
      ? templates.length
      : templates.filter((template) => template.department === key).length

  function pick(next: DepartmentFilter) {
    setDepartment(next)
    writeParams(next, query)
  }

  function search(next: string) {
    setQuery(next)
    writeParams(department, next)
  }

  function clear() {
    setDepartment("all")
    setQuery("")
    writeParams("all", "")
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          aria-label={t("templates_department_label")}
          value={department}
          onValueChange={pick}
          options={(["all", ...TEMPLATE_DEPARTMENTS] as const).map((key) => ({
            value: key,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {key === "all" ? t("templates_all") : labels.department(key)}
                <span className="font-normal text-muted-foreground tabular-nums max-sm:hidden">
                  {count(key)}
                </span>
              </span>
            ),
          }))}
          className="w-full lg:w-auto"
          itemClassName="px-3 max-lg:py-2.5"
        />
        <SearchField value={query} onChange={search} placeholder={t("templates_search")} />
      </div>

      <p className="sr-only" aria-live="polite">
        {t("templates_count", { count: visible.length })}
      </p>

      {visible.length > 0 ? (
        <div className="@container">
          <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
            {visible.map((template) => (
              <TemplateCard key={template.name} template={template} from="catalog" />
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border p-4 lg:p-5">
          <p className="text-sm leading-5 text-muted-foreground">
            {query.trim()
              ? t("templates_no_match", { query: query.trim() })
              : t("templates_no_department")}
          </p>
          <button
            type="button"
            onClick={clear}
            className="text-sm leading-5 font-medium text-link outline-none hover:underline focus-visible:underline"
          >
            {t("templates_clear")}
          </button>
        </div>
      )}
    </div>
  )
}
