import { LogoMark } from "@sniptide/ui/components/logo"
import { ArrowUpRightIcon } from "lucide-react"
import { ThemeSwitch } from "@/components/theme-switch"
import { footerLinks, legalLinks } from "@/lib/nav"

// The docs' footer: one quiet band under every page with the mark, the links out of the docs, the
// colour scheme switch and the legal links. The marketing site's large footer stays on
// sniptide.com, so reading a page ends on the page rather than on a second landing page.
export function DocsFooter() {
  return (
    <footer className="border-t bg-sidebar text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
          <span className="flex items-center gap-2 text-foreground">
            <LogoMark className="h-4 w-[17px]" />
            <span className="font-medium">Sniptide docs</span>
          </span>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks().map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {link.label}
                    <ArrowUpRightIcon aria-hidden="true" className="size-3.5 opacity-60" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex items-center justify-between gap-6">
          <ul className="flex gap-4 text-xs">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="transition-colors hover:text-foreground">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  )
}
