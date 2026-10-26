import { cn } from "@sniptide/ui/lib/utils"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { Metadata } from "next"
import { Archivo, Inter } from "next/font/google"
import localFont from "next/font/local"
import { siteDescription, siteName, siteUrl } from "@/lib/site"
import "./global.css"

// The same three faces as the app (apps/web/app/layout.tsx), so the docs read as Sniptide.
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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: siteName, template: `%s · ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  openGraph: { type: "website", siteName, locale: "en_US" },
  twitter: { card: "summary_large_image" },
}

export default function Layout({ children }: LayoutProps<"/">) {
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
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
