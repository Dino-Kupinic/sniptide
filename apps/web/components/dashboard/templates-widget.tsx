"use client"

import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import { SquarePenIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type * as React from "react"
import { track } from "@/lib/analytics"
import type { WidgetSize } from "@/lib/dashboard/widgets"
import type { TemplateSummary, TemplateVisual } from "@/lib/pastes/templates"
import type { TemplateCategory, TemplateDepartment } from "@/lib/template-filter"

// How many templates each size lists: two rows of four when large, two rows of two when small.
// A single column, as on a phone, stops after three so the widgets below stay in reach.
const SHOWN: Record<WidgetSize, number> = { large: 8, small: 4 }
const SINGLE_COLUMN = 3

// Logos share one height, so wordmarks of different widths read as peers. The artwork is a mask
// filled with the text color, so it follows light and dark like the app's other icons.
const LOGO_HEIGHT = 26

function Visual({ visual }: { visual: TemplateVisual }) {
  if (visual.kind === "logo") {
    const style: React.CSSProperties = {
      width: LOGO_HEIGHT * visual.ratio,
      height: LOGO_HEIGHT,
      maskImage: `url("${visual.src}")`,
      maskSize: "contain",
      maskRepeat: "no-repeat",
      maskPosition: "center",
    }
    return <span aria-hidden className="block max-w-full bg-foreground" style={style} />
  }
  return (
    <>
      <img src={visual.src} alt="" width={28} height={28} className="size-7 shrink-0" />
      <span className="truncate font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
        {visual.mark}
      </span>
    </>
  )
}

// The reader's names for a template's category and department, which the cells show and the
// catalog searches.
export function useTemplateLabels() {
  const t = useTranslations("Workspace")
  // Literal keys keep every label visible to the message extractor and the unused-message check.
  const categories: Record<TemplateCategory, string> = {
    agents: t("templates_category_agents"),
    deploy: t("templates_category_deploy"),
    project: t("templates_category_project"),
    specs: t("templates_category_specs"),
    discovery: t("templates_category_discovery"),
    writing: t("templates_category_writing"),
  }
  const departments: Record<TemplateDepartment, string> = {
    engineering: t("templates_department_engineering"),
    product: t("templates_department_product"),
    marketing: t("templates_department_marketing"),
  }
  return {
    category: (category: TemplateCategory | null) => (category ? categories[category] : null),
    department: (department: TemplateDepartment | null) =>
      department ? departments[department] : null,
  }
}

// One template as the website's directory draws it: a cover with the tool's logo over a blurred
// glimpse of the main file, then the category, title and description, and a footer with the file
// count and Use template. The whole card opens the editor filled with the template's files, and
// the person saves an ordinary paste of their own.
export function TemplateCard({
  template,
  from,
  className,
}: {
  template: TemplateSummary
  // Where the card sits, for the analytics event.
  from: "dashboard" | "catalog"
  className?: string
}) {
  const t = useTranslations("Workspace")
  const tPaste = useTranslations("Paste")
  const labels = useTemplateLabels()
  const category = labels.category(template.category)
  const href = `/new?template=${encodeURIComponent(template.name)}`
  const open = () => track("template_opened", { template: template.name, from })
  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-border bg-sidebar">
        {template.preview ? (
          <pre
            aria-hidden
            className="absolute inset-0 overflow-hidden px-3.5 pt-2.5 font-mono text-xs leading-5 whitespace-pre text-muted-foreground opacity-50 blur-[3px] select-none"
          >
            {template.preview}
          </pre>
        ) : null}
        <div className="relative flex h-14 max-w-[80%] min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background px-5 text-foreground">
          {template.visual ? (
            <Visual visual={template.visual} />
          ) : (
            <span className="truncate font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
              {template.files[0]?.split("/").pop()}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
        {category ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">{category}</span>
        ) : null}
        <Link
          href={href}
          onClick={open}
          className="mt-1.5 line-clamp-2 font-heading text-xl leading-7 font-bold tracking-[-0.02em] text-balance [overflow-wrap:anywhere] outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
        >
          {template.title}
        </Link>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-pretty text-muted-foreground">
          {template.description}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="min-w-0 truncate text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            {tPaste("fileCount", { count: template.files.length })}
          </span>
          <Button
            size="sm"
            className="relative z-10 shrink-0"
            nativeButton={false}
            render={<Link href={href} onClick={open} />}
            aria-label={t("templates_use_label", { title: template.title })}
          >
            <SquarePenIcon aria-hidden />
            {t("templates_use")}
          </Button>
        </div>
      </div>
    </li>
  )
}

// The first templates on the dashboard, as the same cards as the catalog page.
export function TemplatesGrid({
  templates,
  size,
}: {
  templates: TemplateSummary[]
  size: WidgetSize
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 p-4 @xl/widget:grid-cols-2 @5xl/widget:grid-cols-4">
      {templates.slice(0, SHOWN[size]).map((template, index) => (
        <TemplateCard
          key={template.name}
          template={template}
          from="dashboard"
          className={index >= SINGLE_COLUMN ? "@max-xl/widget:hidden" : undefined}
        />
      ))}
    </ul>
  )
}
