import { Button } from "@workspace/ui/components/button"
import { getSession } from "@/lib/auth"

export default async function Page() {
  const session = await getSession()

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4 border border-foreground bg-card p-7 shadow-[8px_8px_0_0_var(--foreground)]">
        <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight uppercase">
          Short links
          <br />
          for your code.
        </h1>
        <p className="text-sm text-muted-foreground">
          {session ? `Signed in as ${session.user.email}.` : "Not signed in yet."}
        </p>
        <div className="flex items-center justify-between bg-muted px-3 py-2.5 text-xs">
          <span className="font-mono text-primary">sniptide.com/k7Qe2x</span>
          <span className="text-muted-foreground">expires in 6 days</span>
        </div>
        <Button size="lg">New paste</Button>
      </div>
    </main>
  )
}
