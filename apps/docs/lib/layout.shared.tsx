import { Logo } from "@sniptide/ui/components/logo"
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { gitHubUrl } from "./site"

// The header and footer are the docs' own (components/docs-header.tsx and docs-footer.tsx), so the
// colour scheme switch lives in the footer, as on sniptide.com.
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Logo />, url: "/" },
    githubUrl: gitHubUrl,
    themeSwitch: { enabled: false },
  }
}
