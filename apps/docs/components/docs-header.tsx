"use client"

import { buttonVariants } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import { usePathname } from "fumadocs-core/framework"
import Link from "fumadocs-core/link"
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook"
import { ArrowUpRightIcon, ChevronRightIcon, MenuIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { useAppUrl } from "@/components/app-url"
import { LogoMark, Wordmark } from "@/components/brand"
import { GitHubMark } from "@/components/github-mark"
import { activeSection, navSections } from "@/lib/nav"
import { gitHubUrl } from "@/lib/site"

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"

// The section links share the marketing header's nav style: 32px rows in the secondary text
// colour that fill with --muted on hover, with the current section in the text colour.
const navLink =
  "flex h-8 items-center whitespace-nowrap rounded-md px-3 text-sm leading-5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

// The docs header, built like the one on sniptide.com: the logo and wordmark, the sections as
// links, search in the middle and the two calls to action on the right. On phones it keeps the
// logo, search and the menu button that opens the sidebar.
export function DocsHeader(props: ComponentProps<"header">) {
  const { slots } = useNotebookLayout()
  const appUrl = useAppUrl()
  const current = activeSection(usePathname())

  return (
    <header
      id="nd-subnav"
      {...props}
      className={cn(
        "sticky top-(--fd-docs-row-1) z-10 border-b bg-background [grid-area:header]",
        props.className,
      )}
    >
      <div className="flex h-14 items-center gap-6 px-5 md:h-16 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Link href="/" className={cn("flex shrink-0 items-center gap-2.5", focusRing)}>
            <span className="flex items-center gap-1.75">
              <LogoMark className="h-6 w-[25px] text-logo-primary dark:text-foreground" />
              <Wordmark className="mt-px h-[18px] w-[111px] text-foreground" />
            </span>
            <span aria-hidden className="h-5 border-l border-border" />
            <span className="text-sm leading-5 font-medium text-muted-foreground">Docs</span>
            <span className="sr-only">Sniptide docs, home</span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-1 xl:flex">
            {navSections.map((section) => (
              <Link
                key={section.label}
                href={section.href}
                aria-current={section === current ? "true" : undefined}
                className={cn(navLink, section === current && "text-foreground", focusRing)}
              >
                {section.label}
              </Link>
            ))}
            <a
              href={`${appUrl}/docs/api`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(navLink, "gap-1", focusRing)}
            >
              API reference
              <ArrowUpRightIcon aria-hidden className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </nav>
        </div>

        {slots.searchTrigger && (
          <slots.searchTrigger.full
            hideIfDisabled
            className="my-auto hidden w-full max-w-60 rounded-lg bg-background md:flex xl:max-w-72"
          />
        )}

        <div className="flex shrink-0 items-center justify-end gap-2">
          <a
            href={gitHubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex",
              focusRing,
            )}
          >
            <GitHubMark className="size-4" />
            <span className="sr-only">Sniptide on GitHub (opens in a new tab)</span>
          </a>
          <span aria-hidden className="mx-1 hidden h-5 border-l border-border lg:block" />
          <a
            href={`${appUrl}/sign-in`}
            className={cn(buttonVariants({ variant: "outline" }), "hidden md:inline-flex")}
          >
            Sign in
          </a>
          <a
            href={`${appUrl}/sign-up`}
            className={cn(buttonVariants(), "hidden gap-1.5 sm:inline-flex")}
          >
            Get started
            <ChevronRightIcon className="size-3" strokeWidth={2.5} />
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
    </header>
  )
}
