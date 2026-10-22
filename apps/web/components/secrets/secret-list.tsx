import { Badge } from "@sniptide/ui/components/badge"
import { Button } from "@sniptide/ui/components/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ListHeader } from "@/components/lists/toolbar"
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
    <div className="ph-no-capture flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={t("title")}
        count={groups.length}
        description={t("list_description")}
        actions={
          <Button size="lg" render={<Link href="/secrets/new" />} nativeButton={false}>
            <PlusIcon />
            {t("new_group")}
          </Button>
        }
        mobileActions={
          <Button
            size="xl"
            aria-label={t("new_group")}
            render={<Link href="/secrets/new" />}
            nativeButton={false}
            className="w-10 px-0"
          >
            <PlusIcon />
          </Button>
        }
      />
      {groups.length === 0 ? (
        <div className="rounded-lg flex flex-col items-center gap-3 border border-border px-4 py-14 text-center text-sm text-muted-foreground">
          {t("empty_sentence")}
          <Link href="/secrets/new" className="font-medium text-link hover:underline">
            {t("new_group")}
          </Link>
        </div>
      ) : (
        <>
          <p className="max-w-[68ch] text-sm text-muted-foreground">{t("mask_notice")}</p>
          {[...projects].map(([project, items]) => (
            <section key={project} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">{project}</h2>
              <ul className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border">
                {items.map((group) => (
                  <li key={group.id}>
                    <Link
                      href={`/secrets/${group.id}`}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-mono text-[13px]">{group.slug}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("variable_count", { count: group.count })}
                        </span>
                      </span>
                      <Badge variant="muted" className="max-w-[45%] text-xs font-normal">
                        <span className="truncate">{group.environment ?? t("no_environment")}</span>
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
