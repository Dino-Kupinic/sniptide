import { ArrowUpRightIcon } from "lucide-react"
import Image from "next/image"
import grid from "@/assets/footer-grid.png"
import { LogoMark, Wordmark } from "@/components/brand"
import { ThemeSwitch } from "@/components/theme-switch"
import { getMessages } from "@/lib/messages"
import { footerColumns, legalLinks } from "@/lib/nav"

// Moonlit in dark mode; light mode sets the logo in blue and black (sniptide-web
// components/site-footer.tsx).
const markStops: [number, string][] = [
  [0, "#E4E3FF"],
  [0.5, "#8F8CFF"],
  [1, "#3A36FF"],
]
const wordmarkStops: [number, string][] = [
  [0, "#FFFFFF"],
  [0.45, "#E6E6F2"],
  [0.55, "#C9C7FF"],
  [1, "#8F8CFF"],
]

// The marketing site's footer (sniptide-web components/site-footer.tsx) in the docs' tokens: the
// dithered grid, the pitch line, the same link columns, the large logo and the legal row.
export function DocsFooter({ lang }: { lang: string }) {
  const t = getMessages(lang)
  return (
    <footer className="@container relative overflow-clip border-t bg-background text-foreground">
      <Image
        src={grid}
        alt=""
        aria-hidden="true"
        unoptimized
        className="pointer-events-none absolute top-[-440px] left-[-60px] h-205 w-360 max-w-none invert hue-rotate-180 max-md:[mask-image:linear-gradient(to_bottom,transparent_440px,black_600px)] md:top-[-231px] md:left-1/2 md:h-auto md:w-360 md:-translate-x-1/2 min-[90rem]:[mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)] dark:mix-blend-lighten dark:invert-0 dark:hue-rotate-0"
      />
      <div className="pointer-events-none absolute bottom-[-60px] left-[calc(50%-600px)] hidden h-80 w-300 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgb(42_38_236/0.35),transparent)] dark:block" />

      <div className="relative mx-auto flex max-w-[1440px] flex-col px-5 pt-76 md:px-6 md:pt-136">
        <div className="grid gap-x-6 gap-y-12 md:grid-cols-6">
          <div className="flex flex-col gap-2 md:col-span-2 md:pr-6 xl:pr-12">
            <h2 className="font-heading text-2xl leading-8 font-bold tracking-[-0.02em] text-balance">
              {t.footerTitle}
            </h2>
            <p className="max-w-96 text-[15px] leading-6 text-muted-foreground">{t.footerText}</p>
          </div>

          <nav
            aria-label={t.footer}
            className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 md:col-span-4"
          >
            {footerColumns(lang).map((column) => (
              <div key={column.label} className="flex min-w-0 flex-col gap-4">
                <h2 className="text-sm leading-5 font-medium">{t[column.label]}</h2>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="inline-flex items-center gap-1 text-sm leading-5 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t[link.label]}
                        {link.external && (
                          <>
                            <ArrowUpRightIcon aria-hidden="true" className="size-3.5 opacity-60" />
                            <span className="sr-only">{t.newTab}</span>
                          </>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-20 flex max-w-348 items-center gap-4 md:gap-[4.67%]">
          <LogoMark className="aspect-[243/234] w-[17.4%] text-logo-primary dark:hidden" />
          <LogoMark className="hidden aspect-[243/234] w-[17.4%] dark:block" stops={markStops} />
          <div className="flex-1 pt-[0.65%]">
            <Wordmark className="aspect-[4340/683] w-full text-black dark:hidden" />
            <Wordmark
              className="hidden aspect-[4340/683] w-full dark:block"
              stops={wordmarkStops}
            />
          </div>
          <span className="sr-only">Sniptide</span>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 pb-5 text-xs leading-4 text-muted-foreground md:mt-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-4 md:justify-start">
            <p>© 2026 Sniptide</p>
            <ThemeSwitch
              labels={{ legend: t.colorScheme, light: t.light, system: t.system, dark: t.dark }}
            />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2 font-mono uppercase md:gap-6">
            {legalLinks.map((link) => (
              <a key={link.label} href={link.href} className="hover:text-link">
                {t[link.label]}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
