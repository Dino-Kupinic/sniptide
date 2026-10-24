import { Logo } from "@sniptide/ui/components/logo"
import { Stripes } from "@sniptide/ui/components/stripes"
import { cn } from "@sniptide/ui/lib/utils"
import type * as React from "react"
import { LanguageSwitcher } from "@/components/language-switcher"
import { getConfig } from "@/lib/config"

export interface Pitch {
  title: [string, string]
  body: string
  link: string
  note: string
}

// Split auth layout from the Paper Sign in / Sign up artboards: form on the left, barcode
// stripes with a pitch card on the right. Below lg the stripes become a strip above the form.
// `centered` is for short screens (request access): on phones the content sits mid-screen, centered.
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
  legal: string
  pitch: Pitch
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <div className="flex min-w-0 flex-1 flex-col lg:w-1/2 lg:flex-none lg:px-10 lg:py-8">
        <div className="relative h-30 shrink-0 overflow-hidden lg:hidden">
          <Stripes className="-top-[300px] -left-[150px] h-[900px] w-[720px]" />
        </div>

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
                <h1 className="font-heading text-[32px] leading-9 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10">
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
            </div>
            {children}
          </div>
        </main>

        <footer className="flex flex-col items-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:items-start lg:p-0">
          <LanguageSwitcher />
          <p className="text-center text-xs text-muted-foreground lg:text-left">{legal}</p>
        </footer>
      </div>

      <aside className="relative hidden w-1/2 items-center justify-center overflow-hidden border-l border-border lg:flex">
        <Stripes className="inset-0 size-full" />
        <div className="rounded-lg relative flex w-[400px] flex-col gap-[18px] border border-border bg-background p-7 shadow-(--dialog-shadow)">
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
