import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { SecretActivity } from "@/components/secrets/secret-activity"
import { getSession } from "@/lib/auth"
import { listAudit } from "@/lib/env/audit"
import { AUDIT_FILTERS } from "@/lib/env/inputs"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Secrets")
  return { title: `${t("audit_title")} · Sniptide`, robots: { index: false, follow: false } }
}
export const dynamic = "force-dynamic"

const querySchema = z.object({
  group: z.string().uuid().optional().catch(undefined),
  filter: z.enum(AUDIT_FILTERS).catch("all"),
  page: z.coerce.number().int().min(0).max(10000).catch(0),
})

export default async function Page({ searchParams }: PageProps<"/secrets/activity">) {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  const query = querySchema.parse(await searchParams)
  const { entries, more } = await listAudit(session.user.id, {
    groupId: query.group,
    filter: query.filter,
    page: query.page,
  })
  return (
    <SecretActivity
      entries={entries}
      more={more}
      page={query.page}
      filter={query.filter}
      group={query.group ? { id: query.group, slug: entries[0]?.groupSlug ?? null } : null}
    />
  )
}
