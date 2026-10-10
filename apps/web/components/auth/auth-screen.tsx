import { Logo } from "@sniptide/ui/components/logo"
import { Stripes } from "@sniptide/ui/components/stripes"
import type * as React from "react"

export interface Pitch {
  title: [string, string]
  body: string
  link: string
  note: string
}

// Split auth layout from the Paper Sign in / Sign up artboards: form on the left, barcode
// stripes with a pitch card on the right. Below lg the stripes become a strip above the form.
export function AuthScreen({
  title,
  subtitle,
  legal,
  pitch,
  children,
}: {
  title: string
  subtitle: string
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
          <Logo />
        </div>

        <main className="flex flex-1 justify-center px-5 pt-6 pb-8 lg:items-center lg:p-0">
          <div className="flex w-full flex-col gap-5 lg:max-w-[360px] lg:gap-6">
            <Logo className="lg:hidden" />
            <div className="flex flex-col gap-1.5 lg:gap-2">
              <h1 className="font-heading text-[32px] leading-9 font-bold tracking-[-0.02em] uppercase lg:text-4xl lg:leading-10">
                {title}
              </h1>
              <p className="text-[15px] leading-5 text-muted-foreground lg:text-sm">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>

        <p className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground lg:p-0 lg:text-left">
          {legal}
        </p>
      </div>

      <aside className="relative hidden w-1/2 items-center justify-center overflow-hidden border-l border-border lg:flex">
        <Stripes className="inset-0 size-full" />
        <div className="relative flex w-[400px] flex-col gap-[18px] border border-offset-shadow bg-background p-7 shadow-[8px_8px_0_0_var(--offset-shadow)]">
          <p className="font-heading text-3xl leading-[34px] font-bold tracking-[-0.02em] uppercase">
            {pitch.title[0]}
            <br />
            {pitch.title[1]}
          </p>
          <p className="text-sm leading-[21px] text-foreground/80">{pitch.body}</p>
          <div className="flex items-center justify-between bg-muted px-3 py-2.5">
            <span className="font-mono text-[13px] text-link">{pitch.link}</span>
            <span className="text-xs text-muted-foreground">{pitch.note}</span>
          </div>
        </div>
      </aside>
    </div>
  )
}
