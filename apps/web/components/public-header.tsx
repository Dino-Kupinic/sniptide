import { Button } from "@sniptide/ui/components/button"
import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { LanguageMenu } from "@/components/language-switcher"
import { getAppOrigin } from "@/lib/site"

// Header for pages visitors see without signing in (the public share page). Plain <a> tags, not
// <Link>: this page can be served on a different domain than the app (see getAppOrigin).
export function PublicHeader({
  signedIn,
  languageMenu = true,
  className,
}: {
  signedIn: boolean
  // The paste page offers the language below the code card instead.
  languageMenu?: boolean
  className?: string
}) {
  const t = useTranslations("Auth")
  const appOrigin = getAppOrigin()

  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b-0 bg-sidebar px-4 lg:border-b lg:border-border lg:px-10",
        className,
      )}
    >
      <a
        href={signedIn ? `${appOrigin}/dashboard` : "/"}
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Logo className="max-sm:[&>span]:hidden" />
      </a>
      <nav aria-label={t("navigation")} className="flex items-center gap-2">
        {languageMenu ? (
          <LanguageMenu side="bottom" size="default" compact className="max-sm:w-8 max-sm:px-0" />
        ) : null}
        <Button
          variant="outline"
          aria-label={t("createPaste")}
          className="max-sm:w-8 max-sm:px-0"
          render={<a href={`${appOrigin}/new`} />}
          nativeButton={false}
        >
          <PlusIcon />
          <span className="max-sm:hidden">{t("createPaste")}</span>
        </Button>
        <Button
          variant="inverted"
          render={<a href={`${appOrigin}${signedIn ? "/dashboard" : "/sign-in"}`} />}
          nativeButton={false}
        >
          {t(signedIn ? "dashboard" : "signIn")}
        </Button>
      </nav>
    </header>
  )
}
