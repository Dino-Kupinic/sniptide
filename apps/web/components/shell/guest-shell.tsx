"use client"

import { Logo } from "@sniptide/ui/components/logo"
import { TooltipProvider } from "@sniptide/ui/components/tooltip"
import { useTranslations } from "next-intl"
import { HeaderSlotsProvider, useHeaderSlotRefs } from "./page-header"

// The frame around the editor for a visitor without a session. The editor puts its actions into
// the header's slot, as it does in the app's top bar. Phones show the editor's own top bar and
// bottom bar instead, as they do inside the app.
export function GuestShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Workspace")
  return (
    <TooltipProvider delay={300}>
      <HeaderSlotsProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground focus:ring-2 focus:ring-ring"
        >
          {t("skipToMain")}
        </a>
        <div className="flex min-h-svh flex-col bg-background has-data-grouped:max-lg:bg-grouped">
          <GuestHeader />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col"
          >
            {children}
          </main>
        </div>
      </HeaderSlotsProvider>
    </TooltipProvider>
  )
}

function GuestHeader() {
  const { setActions } = useHeaderSlotRefs()
  return (
    <header className="sticky top-0 z-30 hidden h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-sidebar px-10 lg:flex">
      <a
        href="/"
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Logo />
      </a>
      <div
        ref={setActions}
        data-header-actions=""
        className="flex shrink-0 flex-wrap items-center gap-2 empty:hidden"
      />
    </header>
  )
}
