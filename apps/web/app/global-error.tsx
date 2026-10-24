"use client"

import "@sniptide/ui/globals.css"
import { Button } from "@sniptide/ui/components/button"

// Replaces the root layout when it throws, so there are no providers, no translations and no
// fonts here: English copy, the system font stack and the light theme, because the theme provider
// that applies the user's choice is part of the layout that failed.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
          <title>Something went wrong</title>
          <h1 className="text-center text-[30px] leading-[34px] font-bold tracking-[-0.01em]">
            Something went wrong.
          </h1>
          <p className="mt-2.5 max-w-[440px] text-center text-[15px] leading-[22px] text-muted-foreground">
            We couldn't load this page. Try again, and if it keeps happening, come back in a few
            minutes.
          </p>
          <Button className="mt-7 h-11 px-[22px]" onClick={() => retry()}>
            Try again
          </Button>
          {error.digest ? (
            <span className="mt-5 font-mono text-xs leading-4 text-muted-foreground">
              Error reference {error.digest}
            </span>
          ) : null}
        </main>
      </body>
    </html>
  )
}
