import { Button } from "@sniptide/ui/components/button"
import { Logo } from "@sniptide/ui/components/logo"
import Link from "next/link"
import type { ReactNode } from "react"
import { signOut } from "@/lib/actions"

// The signed-in frame: the logo and a way out above the page, which stops at 1440px.
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between border-b border-border bg-sidebar px-4 lg:px-7">
        <Link
          href="/"
          aria-label="Product updates"
          className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <Logo className="h-6 w-auto" />
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1">{children}</main>
    </div>
  )
}
