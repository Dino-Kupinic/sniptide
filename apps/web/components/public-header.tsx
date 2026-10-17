import { Button } from "@sniptide/ui/components/button"
import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import { useTranslations } from "next-intl"
import { LanguageSwitcher } from "@/components/language-switcher"
import { getAppOrigin } from "@/lib/site"

// Header for pages visitors see without signing in (the public share page). Plain <a> tags, not
// <Link>: this page can be served on a different domain than the app (see getAppOrigin).
export function PublicHeader({ signedIn, className }: { signedIn: boolean; className?: string }) {
  const t = useTranslations("Auth")
  const appOrigin = getAppOrigin()

  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b-0 px-4 lg:border-b lg:border-border lg:px-10",
        className,
      )}
    >
      <a
        href={signedIn ? `${appOrigin}/dashboard` : "/"}
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Logo className="max-sm:[&>span]:hidden" />
      </a>
      <nav aria-label={t("navigation")} className="flex items-center gap-3 text-sm sm:gap-5">
        <LanguageSwitcher compact />
        <a
          href={`${appOrigin}/new`}
          className="hidden text-foreground/80 hover:text-foreground lg:inline"
        >
          {t("createPaste")}
        </a>
        <Button
          variant="inverted"
          className="h-9 px-3.5 text-sm"
          render={<a href={`${appOrigin}${signedIn ? "/dashboard" : "/sign-in"}`} />}
          nativeButton={false}
        >
          {t(signedIn ? "dashboard" : "signIn")}
        </Button>
      </nav>
    </header>
  )
}
