import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono, Stack_Sans_Notch } from "next/font/google"

import "@sniptide/ui/globals.css"
import { cn } from "@sniptide/ui/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"

const fontHeading = Stack_Sans_Notch({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-heading",
})

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Name shown when the app is added to an iOS home screen.
export const metadata: Metadata = {
  other: { "apple-mobile-web-app-title": "Sniptide" },
}

// viewport-fit=cover lets the mobile tab bar pad itself past the home indicator.
export const viewport: Viewport = {
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased font-sans",
        fontSans.variable,
        fontMono.variable,
        fontHeading.variable,
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
