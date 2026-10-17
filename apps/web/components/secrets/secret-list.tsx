import { Button } from "@sniptide/ui/components/button"
import { KeyRoundIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { SecretSummary } from "@/lib/env/web-store"

export async function SecretList({ groups }: { groups: SecretSummary[] }) {
  const t = await getTranslations("Secrets")
  const projects = new Map<string, SecretSummary[]>()
  for (const group of groups) {
    const project = group.project ?? t("ungrouped")
    const items = projects.get(project) ?? []
    items.push(group)
    projects.set(project, items)
  }
  return (
    <main className="ph-no-capture mx-auto w-full max-w-5xl space-y-8 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("list_description")}</p>
        </div>
        <Button render={<Link href="/secrets/new" />} nativeButton={false}>
          <PlusIcon />
          {t("new_group")}
        </Button>
      </div>
      <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">
        {t("mask_notice")}
      </p>
      {groups.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <KeyRoundIcon className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h2 className="font-medium">{t("empty_title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("empty_description")}</p>
        </div>
      ) : (
        [...projects].map(([project, items]) => (
          <section key={project} className="space-y-3">
            <h2 className="font-medium">{project}</h2>
            <div className="divide-y divide-border border border-border">
              {items.map((group) => (
                <Link
                  key={group.id}
                  href={`/secrets/${group.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div>
                    <span className="font-mono text-sm">{group.slug}</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("variable_count", { count: group.count })}
                    </p>
                  </div>
                  <span className="border border-border px-2 py-1 text-xs">
                    {group.environment ?? t("no_environment")}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
