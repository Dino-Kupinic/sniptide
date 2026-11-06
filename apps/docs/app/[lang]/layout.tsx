import { cn } from "@sniptide/ui/lib/utils"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { Metadata } from "next"
import { Archivo, Inter } from "next/font/google"
import localFont from "next/font/local"
import { notFound } from "next/navigation"
import { AppUrlProvider } from "@/components/app-url"
import { i18n, isLocale } from "@/lib/i18n"
import { i18nUI } from "@/lib/i18n-ui"
import { appUrl, siteDescription, siteName, siteUrl } from "@/lib/site"
import "../global.css"

// The same three faces as the app (apps/web/app/layout.tsx), so the docs read as Sniptide.
const fontHeading = Archivo({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-heading",
})

// The opsz axis gives text above 14px Inter's optical size for it (font-optical-sizing: auto).
const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  axes: ["opsz"],
})

const fontMono = localFont({
  src: "../../../../packages/ui/src/fonts/PaperMono[wght].ttf",
  weight: "100 800",
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: siteName, template: `%s · ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  openGraph: { type: "website", siteName, locale: "en_US" },
  twitter: { card: "summary_large_image" },
}

// Every language is prerendered, and any other first segment is a page path that the proxy has
// already given the English prefix.
export const dynamicParams = false

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }))
}

export default async function Layout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={cn(
        "antialiased font-sans",
        fontSans.variable,
        fontMono.variable,
        fontHeading.variable,
      )}
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider i18n={i18nUI.provider(lang)}>
          <AppUrlProvider value={appUrl()}>{children}</AppUrlProvider>
        </RootProvider>
      </body>
    </html>
  )
}
