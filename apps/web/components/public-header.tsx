import { Button } from "@workspace/ui/components/button"
import Link from "next/link"
import { Logo } from "@/components/logo"

// Header for pages visitors see without signing in (the public share page).
export function PublicHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="flex h-16 items-center justify-between border-b-0 px-4 lg:border-b lg:border-border lg:px-10">
      <Link
        href={signedIn ? "/dashboard" : "/"}
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Logo />
      </Link>
      <nav className="flex items-center gap-5 text-sm">
        <Link href="/new" className="hidden text-foreground/80 hover:text-foreground lg:inline">
          Create a paste
        </Link>
        <Button
          variant="inverted"
          className="h-9 px-3.5 text-sm"
          render={<Link href={signedIn ? "/dashboard" : "/sign-in"} />}
          nativeButton={false}
        >
          {signedIn ? "Dashboard" : "Sign in"}
        </Button>
      </nav>
    </header>
  )
}
