import { Button } from "@sniptide/ui/components/button"
import { Logo } from "@sniptide/ui/components/logo"
import Link from "next/link"
import type { ReactNode } from "react"
import { AdminNav } from "@/components/admin-nav"
import { signOut } from "@/lib/actions"

function Home() {
  return (
    <Link
      href="/"
      aria-label="Overview"
      className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <Logo className="h-6 w-auto" />
    </Link>
  )
}

function SignOut() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  )
}

// The signed-in frame. From 1024px a sidebar holds the logo, the sections and Sign out beside the
// page. Below that a top bar holds the logo and Sign out, with the sections in a row under it.
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="flex h-16 items-center px-5">
          <Home />
        </div>
        <div className="flex-1 px-3">
          <AdminNav layout="column" />
        </div>
        <div className="p-3">
          <SignOut />
        </div>
      </aside>
      <header className="border-b border-border bg-sidebar lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Home />
          <SignOut />
        </div>
        <div className="overflow-x-auto px-3 pb-2">
          <AdminNav layout="row" />
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-[1440px] min-w-0 flex-1">
        {children}
      </main>
    </div>
  )
}
