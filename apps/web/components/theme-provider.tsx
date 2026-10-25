"use client"

import { usePathname } from "next/navigation"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// The print view (/<slug>/print) is meant for paper, so it stays light whatever the theme. The
// app's own two-segment routes are left out, so a paste or collection named "print" keeps it.
const printPath = /^\/(?!(?:pastes|collections|secrets|secret-share|dev)\/)[^/]+\/print$/

function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname()
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={printPath.test(pathname) ? "light" : undefined}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
