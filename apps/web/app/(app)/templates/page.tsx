import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PageHeader } from "@/components/page-header"
import { TemplateCatalog } from "@/components/templates/template-catalog"
import { gallerySource, templateCatalog } from "@/lib/pastes/templates"

export async function generateMetadata() {
  const t = await getTranslations("Workspace")
  return { title: `${t("paste_templates")} · Sniptide` }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

// Cloud instances with a template source offer a searchable gallery.
export default async function Page({ searchParams }: PageProps<"/templates">) {
  if (!gallerySource()) notFound()
  const [templates, query, t] = await Promise.all([
    templateCatalog(),
    searchParams,
    getTranslations("Workspace"),
  ])

  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <PageHeader title={t("paste_templates")} description={t("templates_intro")} />
      {templates.length > 0 ? (
        <TemplateCatalog
          templates={templates}
          initialDepartment={first(query.department)}
          initialQuery={first(query.q)}
        />
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm leading-5 text-muted-foreground lg:p-5">
          {t("widget_templates_empty")}
        </p>
      )}
    </div>
  )
}
