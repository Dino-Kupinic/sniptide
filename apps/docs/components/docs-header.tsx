"use client"

import { buttonVariants } from "@sniptide/ui/components/button"
import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import { usePathname } from "fumadocs-core/framework"
import Link from "fumadocs-core/link"
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook"
import { ArrowUpRightIcon, MenuIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { useAppUrl } from "@/components/app-url"
import { GitHubMark } from "@/components/github-mark"
import { activeSection, navSections } from "@/lib/nav"
import { gitHubUrl } from "@/lib/site"

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

// A section tab: text in the secondary colour on a 2px underline that turns blue on the current
// section, so the docs read as a reference with sections rather than as a site with menus.
const tab =
  "-mb-px flex h-10 items-center gap-1 border-b-2 border-transparent text-sm leading-5 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"

// The docs header: the logo with a Docs label, search as the main control, and one raised button
// into the app. From lg up a second row holds the sections as tabs. Phones keep the logo, search
// and the menu button that opens the sidebar.
export function DocsHeader(props: ComponentProps<"header">) {
  const { slots } = useNotebookLayout()
  const appUrl = useAppUrl()
  const current = activeSection(usePathname())

  return (
    <header
      id="nd-subnav"
      {...props}
      className={cn(
        "sticky top-(--fd-docs-row-1) z-30 border-b bg-background [grid-area:header]",
        props.className,
      )}
    >
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <Link href="/" className={cn("flex shrink-0 items-center gap-3 rounded-md", focusRing)}>
          <Logo />
          <span aria-hidden className="h-5 border-l" />
          <span className="font-heading text-[17px] leading-5 font-bold tracking-[-0.02em] text-foreground">
            Docs
          </span>
          <span className="sr-only">Sniptide docs, home</span>
        </Link>

        <div className="flex flex-1 justify-center">
          {slots.searchTrigger && (
            <slots.searchTrigger.full
              hideIfDisabled
              className="hidden w-full max-w-md rounded-lg bg-muted/60 md:flex"
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={gitHubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex",
              focusRing,
            )}
          >
            <GitHubMark className="size-4" />
            <span className="sr-only">Sniptide on GitHub (opens in a new tab)</span>
          </a>
          <a href={appUrl} className={cn(buttonVariants(), "ml-1.5 hidden gap-1.5 sm:inline-flex")}>
            Open Sniptide
            <ArrowUpRightIcon className="size-3.5" />
          </a>
          <div className="-mr-2 flex items-center md:hidden">
            {slots.searchTrigger && (
              <slots.searchTrigger.sm hideIfDisabled className="size-10 p-0" />
            )}
            {slots.sidebar && (
              <slots.sidebar.trigger
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted",
                  focusRing,
                )}
              >
                <MenuIcon className="size-4" />
                <span className="sr-only">Open the menu</span>
              </slots.sidebar.trigger>
            )}
          </div>
        </div>
      </div>

      <nav aria-label="Sections" className="hidden h-10 items-end gap-6 px-6 lg:flex">
        {navSections.map((section) => (
          <Link
            key={section.label}
            href={section.href}
            aria-current={section === current ? "true" : undefined}
            className={cn(tab, section === current && "border-link text-foreground", focusRing)}
          >
            {section.label}
          </Link>
        ))}
        <a
          href={`${appUrl}/docs/api`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(tab, focusRing)}
        >
          API reference
          <ArrowUpRightIcon aria-hidden className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </nav>
    </header>
  )
}
