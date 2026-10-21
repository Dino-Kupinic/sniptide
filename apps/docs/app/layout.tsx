import { cn } from "@sniptide/ui/lib/utils"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Stack_Sans_Headline } from "next/font/google"
import "./global.css"

// The same three faces as the app (apps/web/app/layout.tsx), so the docs read as Sniptide.
const fontHeading = Stack_Sans_Headline({
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

export const metadata: Metadata = {
  title: { default: "Sniptide docs", template: "%s · Sniptide docs" },
  description: "Guides and concepts for Sniptide, the self-hostable pastebin.",
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
