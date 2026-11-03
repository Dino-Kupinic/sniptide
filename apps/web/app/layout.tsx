import type { Metadata, Viewport } from "next"
import { Archivo, Inter } from "next/font/google"
import localFont from "next/font/local"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"

import "@sniptide/ui/globals.css"
import "@/components/loading/loading.css"
import { Toaster } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { Analytics } from "@/components/analytics"
import { LoadingProvider } from "@/components/loading/provider"
import { ThemeProvider } from "@/components/theme-provider"

const fontHeading = Archivo({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-heading",
})

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = localFont({
  src: "../../../packages/ui/src/fonts/PaperMono[wght].ttf",
  weight: "100 800",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Core")])
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "overscroll-none antialiased font-sans",
        fontSans.variable,
        fontMono.variable,
        fontHeading.variable,
      )}
    >
      <body className="overscroll-none">
        <NextIntlClientProvider>
          <ThemeProvider>
            <LoadingProvider>{children}</LoadingProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <Toaster dismissLabel={t("dismiss")} />
        <Analytics />
      </body>
    </html>
  )
}
