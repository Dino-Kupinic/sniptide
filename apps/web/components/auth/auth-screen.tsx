import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import type * as React from "react"
import { LanguageMenu } from "@/components/language-switcher"
import { getConfig } from "@/lib/config"
import { LifeField } from "./life-field"

export interface Pitch {
  title: [string, string]
  body: string
  link: string
  note: string
}

// Split auth layout from the Paper Sign in / Sign up artboards: the form takes three fifths on the
// left, and the right two fifths hold the pitch card over the Game of Life, always on the dark
// surface. Below lg the card is gone and the pitch body moves under the subtitle.
// `centered` is for short screens (sign-up closed): on phones the content sits mid-screen, centered.
export function AuthScreen({
  title,
  subtitle,
  legal,
  pitch,
  centered = false,
  children,
}: {
  title?: string
  subtitle: string
  centered?: boolean
  legal: React.ReactNode
  pitch: Pitch
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <div className="flex min-w-0 flex-1 flex-col lg:w-3/5 lg:flex-none lg:px-10 lg:py-8">
        <div className="hidden px-2 py-1.5 lg:block">
          <HomeLogo />
        </div>

        {centered ? <HomeLogo className="mx-5 mt-6 lg:hidden" /> : null}

        <main
          className={cn(
            "flex flex-1 justify-center px-5 pt-6 pb-8 lg:items-center lg:p-0",
            centered && "items-center",
          )}
        >
          <div className="flex w-full flex-col gap-5 lg:max-w-[360px] lg:gap-6">
            {centered ? null : <HomeLogo className="lg:hidden" />}
            <div className="flex flex-col gap-1.5 lg:gap-2">
              {title ? (
                <h1 className="font-heading text-2xl leading-8 font-bold tracking-[-0.02em]">
                  {title}
                </h1>
              ) : null}
              <p
                className={cn(
                  "text-[15px] leading-5 text-muted-foreground lg:text-sm",
                  centered && "text-center lg:text-left",
                )}
              >
                {subtitle}
              </p>
              {centered ? null : (
                <p className="text-sm leading-5 text-muted-foreground lg:hidden">{pitch.body}</p>
              )}
            </div>
            {children}
          </div>
        </main>

        <footer className="flex items-center justify-between gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:p-0">
          <div className="min-w-0">{legal}</div>
          <LanguageMenu className="ml-auto shrink-0" />
        </footer>
      </div>

      <aside className="dark relative hidden w-2/5 items-center justify-center overflow-hidden border-l border-border bg-sidebar text-foreground lg:flex">
        <LifeField />
        <div className="rounded-lg relative mx-8 flex w-full max-w-[400px] flex-col gap-[18px] border border-border bg-background p-7">
          <p className="font-heading text-3xl leading-[34px] font-bold tracking-[-0.02em]">
            {pitch.title[0]}
            <br />
            {pitch.title[1]}
          </p>
          <p className="text-sm leading-[21px] text-foreground/80">{pitch.body}</p>
          <div className="rounded-md flex items-center justify-between bg-muted px-3 py-2.5">
            <span className="font-mono text-[13px] text-link">{pitch.link}</span>
            <span className="text-xs text-muted-foreground">{pitch.note}</span>
          </div>
        </div>
      </aside>
    </div>
  )
}

// HOME_URL points the logo at a landing page (sniptide.com/home, which skips the landing page's
// redirect for visitors with a session cookie). A plain <a>, since the landing page is another app.
// Without HOME_URL there is nowhere to go, so the logo stays a logo, confetti included.
function HomeLogo({ className }: { className?: string }) {
  const { homeUrl } = getConfig()
  if (!homeUrl) return <Logo className={className} />

  return (
    <a
      href={homeUrl}
      aria-label="Sniptide"
      className={cn(
        "flex w-fit outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <Logo />
    </a>
  )
}
