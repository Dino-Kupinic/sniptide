import { Button } from "@sniptide/ui/components/button"
import { KeyRoundIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import type { SecretSummary } from "@/lib/env/web-store"

export function SecretList({ groups }: { groups: SecretSummary[] }) {
  const projects = new Map<string, SecretSummary[]>()
  for (const group of groups) {
    const project = group.project ?? "Ungrouped"
    const items = projects.get(project) ?? []
    items.push(group)
    projects.set(project, items)
  }
  return (
    <main className="ph-no-capture mx-auto w-full max-w-5xl space-y-8 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Secrets</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Encrypted env files, grouped by project and environment.
          </p>
        </div>
        <Button render={<Link href="/secrets/new" />} nativeButton={false}>
          <PlusIcon />
          New secret group
        </Button>
      </div>
      <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">
        Values stay masked until you reveal or copy them. Only you have access unless you create a
        protected link.
      </p>
      {groups.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <KeyRoundIcon className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h2 className="font-medium">Keep your first env file here</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add variables by hand or paste a .env file.
          </p>
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
                      {group.count} variables · values masked
                    </p>
                  </div>
                  <span className="border border-border px-2 py-1 text-xs">
                    {group.environment ?? "No environment"}
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
