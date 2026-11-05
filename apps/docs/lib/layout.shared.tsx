import { Logo } from "@sniptide/ui/components/logo"
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { localePath } from "./i18n"
import { gitHubUrl } from "./site"

// The header and footer are the docs' own (components/docs-header.tsx and docs-footer.tsx), so the
// colour scheme switch lives in the footer, as on sniptide.com. The language switch sits in the
// header, and in the menu on phones.
export function baseOptions(lang: string): BaseLayoutProps {
  return {
    nav: { title: <Logo />, url: localePath(lang, "/") },
    githubUrl: gitHubUrl,
    themeSwitch: { enabled: false },
  }
}
