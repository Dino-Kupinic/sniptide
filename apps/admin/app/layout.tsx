import type { Metadata } from "next"
import { Archivo, Inter } from "next/font/google"
import localFont from "next/font/local"
import "./globals.css"
import { Toaster } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"

const fontHeading = Archivo({ subsets: ["latin"], weight: "700", variable: "--font-heading" })
const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = localFont({
  src: "../../../packages/ui/src/fonts/PaperMono[wght].ttf",
  weight: "100 800",
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Sniptide admin",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
      <body className="min-h-dvh bg-background text-foreground">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
